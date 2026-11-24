// 原生 BLE 連線所有權：同一份流程供真實傳輸與可控制時序的假傳輸使用。
use std::future::Future;
use std::sync::Mutex as EpochMutex;
use tokio::sync::Mutex;

pub(crate) const CANCELLED: &str = "Connection attempt superseded or cancelled";

#[derive(Default)]
pub(crate) struct Coordinator {
    generation: EpochMutex<u64>,
    attempts: Mutex<()>,
}

impl Coordinator {
    // 在第一個 await 之前預約世代；新請求或斷線意圖立即退休舊所有權。
    pub(crate) fn begin(&self) -> u64 {
        let mut generation = self.generation.lock().unwrap_or_else(|e| e.into_inner());
        *generation += 1;
        *generation
    }

    // callback 不得 await 或重入本鎖；雙鎖次序為 peripheral -> epoch。
    // callback 不修改世代，因此 panic 後仍可取回值以退休連線。
    pub(crate) fn with_current<R>(
        &self,
        generation: u64,
        callback: impl FnOnce() -> R,
    ) -> Option<R> {
        let current = self.generation.lock().unwrap_or_else(|e| e.into_inner());
        if *current != generation {
            return None;
        }
        let result = callback();
        drop(current);
        Some(result)
    }

    pub(crate) fn check(&self, generation: u64) -> Result<(), String> {
        self.with_current(generation, || ())
            .ok_or_else(|| CANCELLED.into())
    }

    // 等待 peripheral 後重新核對世代，避免排隊期間所有權已被取代。
    pub(crate) async fn with_peripheral<P, R>(
        &self,
        peripheral: &Mutex<Option<P>>,
        generation: u64,
        callback: impl FnOnce(&mut Option<P>) -> R,
    ) -> Option<R> {
        let mut peripheral = peripheral.lock().await;
        self.with_current(generation, || callback(&mut peripheral))
    }

    #[cfg(test)]
    pub(crate) fn locked_during_callback(&self) -> bool {
        matches!(
            self.generation.try_lock(),
            Err(std::sync::TryLockError::WouldBlock)
        )
    }
}

// 傳輸內部若有多個 await，仍須在其間檢查 current，且保證 scan 的收尾。
pub(crate) trait Connector: Sync {
    type Adapter: Send + Sync;
    type Peripheral: Clone + Send + Sync;
    fn adapter(
        &self,
        current: impl Fn() -> bool + Send + Sync,
    ) -> impl Future<Output = Result<Self::Adapter, String>> + Send;
    fn scan(
        &self,
        adapter: &Self::Adapter,
        current: impl Fn() -> bool + Send + Sync,
    ) -> impl Future<Output = Result<Self::Peripheral, String>> + Send;
    fn connect(
        &self,
        peripheral: &Self::Peripheral,
    ) -> impl Future<Output = Result<(), String>> + Send;
    fn setup(
        &self,
        peripheral: &Self::Peripheral,
        current: impl Fn() -> bool + Send + Sync,
    ) -> impl Future<Output = Result<String, String>> + Send;
    fn disconnect(
        &self,
        peripheral: &Self::Peripheral,
    ) -> impl Future<Output = Result<(), String>> + Send;
}

// 失敗時保留原始原因，並如實回報 OS 清理是否失敗。
async fn cleanup<C: Connector>(backend: &C, peripheral: &C::Peripheral, error: String) -> String {
    match backend.disconnect(peripheral).await {
        Ok(()) => error,
        Err(cleanup_error) => format!("{error}; disconnect cleanup failed: {cleanup_error}"),
    }
}

// 取消不能遮蔽同時發生的 OS／掃描收尾錯誤，否則會誤以為實體狀態已知。
fn owned_result<T>(
    coordinator: &Coordinator,
    generation: u64,
    result: Result<T, String>,
) -> Result<T, String> {
    match (coordinator.check(generation), result) {
        (Ok(()), result) => result,
        (Err(cancelled), Ok(_)) => Err(cancelled),
        (Err(cancelled), Err(error)) if cancelled == error => Err(cancelled),
        (Err(cancelled), Err(error)) => Err(format!("{cancelled}; {error}")),
    }
}

pub(crate) async fn establish<C: Connector>(
    coordinator: &Coordinator,
    peripheral: &Mutex<Option<C::Peripheral>>,
    backend: &C,
    publish: impl FnOnce(u64, &C::Peripheral, &str) + Send,
) -> Result<String, String> {
    let generation = coordinator.begin();
    // 序列化 OS 操作及舊嘗試清理；disconnect 不拿 attempts，以便立即失效所有權。
    let _attempt = coordinator.attempts.lock().await;
    coordinator.check(generation)?;
    let old = coordinator
        .with_peripheral(peripheral, generation, |slot| slot.take())
        .await
        .ok_or_else(|| CANCELLED.to_string())?;
    if let Some(old) = old {
        // 未成功釋放舊裝置時不啟動另一條連線，避免同裝置句柄交錯。
        backend.disconnect(&old).await?;
        coordinator.check(generation)?;
    }
    let adapter = backend
        .adapter(|| coordinator.check(generation).is_ok())
        .await;
    let adapter = owned_result(coordinator, generation, adapter)?;
    let found = backend
        .scan(&adapter, || coordinator.check(generation).is_ok())
        .await;
    let found = owned_result(coordinator, generation, found)?;
    let connected = backend.connect(&found).await;
    if let Err(error) = owned_result(coordinator, generation, connected) {
        return Err(cleanup(backend, &found, error).await);
    }
    let name = backend
        .setup(&found, || coordinator.check(generation).is_ok())
        .await;
    let name = match owned_result(coordinator, generation, name) {
        Ok(name) => name,
        Err(error) => return Err(cleanup(backend, &found, error).await),
    };
    let installed = coordinator
        .with_peripheral(peripheral, generation, |slot| {
            *slot = Some(found.clone());
            // handle 先就位，再發布 connected，最後才由 callback 排程 listener；此處不得 await。
            publish(generation, &found, &name);
        })
        .await;
    if installed.is_none() {
        return Err(cleanup(backend, &found, CANCELLED.into()).await);
    }
    Ok(name)
}

pub(crate) async fn disconnect<C: Connector>(
    coordinator: &Coordinator,
    peripheral: &Mutex<Option<C::Peripheral>>,
    backend: &C,
    publish: impl FnOnce(&Result<(), String>) + Send,
) -> Result<(), String> {
    let generation = coordinator.begin();
    let mut slot = peripheral.lock().await;
    let Some(old) = coordinator.with_current(generation, || slot.take()) else {
        return Ok(());
    };
    // 持有 peripheral 直到 OS 收尾完成，新嘗試不能提早使用同一裝置。
    let result = match old {
        Some(old) => backend.disconnect(&old).await,
        None => Ok(()),
    };
    let _ = coordinator.with_current(generation, || publish(&result));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex as RecordMutex};
    use tokio::sync::{Notify, Semaphore};

    type Events = Arc<RecordMutex<Vec<String>>>;
    struct Fake {
        id: usize,
        pause: Option<&'static str>,
        failures: &'static [&'static str],
        pause_cleanup: AtomicBool,
        entered: Notify,
        release: Semaphore,
        events: Events,
    }
    impl Fake {
        fn new(
            id: usize,
            pause: Option<&'static str>,
            failures: &'static [&'static str],
            events: Events,
        ) -> Arc<Self> {
            Arc::new(Self {
                id,
                pause,
                failures,
                pause_cleanup: AtomicBool::new(false),
                entered: Notify::new(),
                release: Semaphore::new(0),
                events,
            })
        }
        async fn step(&self, stage: &str) -> Result<(), String> {
            self.events
                .lock()
                .unwrap()
                .push(format!("{}:{stage}", self.id));
            if self.pause == Some(stage)
                || (stage == "disconnect" && self.pause_cleanup.load(Ordering::SeqCst))
            {
                self.entered.notify_one();
                self.release.acquire().await.unwrap().forget();
            }
            if self.failures.contains(&stage) {
                Err(format!("{stage} failed"))
            } else {
                Ok(())
            }
        }
        fn ensure(current: &impl Fn() -> bool) -> Result<(), String> {
            if current() {
                Ok(())
            } else {
                Err(CANCELLED.into())
            }
        }
    }
    impl Connector for Fake {
        type Adapter = ();
        type Peripheral = usize;
        async fn adapter(&self, current: impl Fn() -> bool + Send + Sync) -> Result<(), String> {
            self.step("adapter").await?;
            Self::ensure(&current)
        }
        async fn scan(
            &self,
            _: &(),
            current: impl Fn() -> bool + Send + Sync,
        ) -> Result<usize, String> {
            self.step("scan").await?;
            if self.failures.contains(&"stop_scan") {
                return Err("scan cancelled; stop_scan failed".into());
            }
            Self::ensure(&current)?;
            Ok(self.id)
        }
        async fn connect(&self, _: &usize) -> Result<(), String> {
            self.step("connect").await
        }
        async fn setup(
            &self,
            _: &usize,
            current: impl Fn() -> bool + Send + Sync,
        ) -> Result<String, String> {
            for stage in ["discover", "subscribe", "properties"] {
                self.step(stage).await?;
                Self::ensure(&current)?;
            }
            Ok(format!("device-{}", self.id))
        }
        async fn disconnect(&self, peripheral: &usize) -> Result<(), String> {
            self.events
                .lock()
                .unwrap()
                .push(format!("{}:disconnect-target:{peripheral}", self.id));
            self.step("disconnect").await
        }
    }
    fn start(
        coordinator: Arc<Coordinator>,
        slot: Arc<Mutex<Option<usize>>>,
        backend: Arc<Fake>,
    ) -> tokio::task::JoinHandle<Result<String, String>> {
        tokio::spawn(async move {
            establish(&coordinator, &slot, &*backend, |_, peripheral, _| {
                backend
                    .events
                    .lock()
                    .unwrap()
                    .push(format!("connected:{peripheral}"));
            })
            .await
        })
    }

    #[tokio::test]
    async fn cancellation_at_each_await_boundary_never_installs_or_publishes() {
        for stage in [
            "adapter",
            "scan",
            "connect",
            "discover",
            "subscribe",
            "properties",
        ] {
            let coordinator = Arc::new(Coordinator::default());
            let slot = Arc::new(Mutex::new(None));
            let events = Events::default();
            let backend = Fake::new(1, Some(stage), &[], events.clone());
            let attempt = start(coordinator.clone(), slot.clone(), backend.clone());
            backend.entered.notified().await;
            disconnect(&coordinator, &slot, &*backend, |_| {})
                .await
                .unwrap();
            backend.release.add_permits(1);
            assert!(
                attempt.await.unwrap().unwrap_err().contains(CANCELLED),
                "stage={stage}"
            );
            assert!(slot.lock().await.is_none());
            let events = events.lock().unwrap();
            assert!(!events.iter().any(|event| event.starts_with("connected:")));
            let cleanup_required = !matches!(stage, "adapter" | "scan");
            assert_eq!(
                events.iter().any(|event| event == "1:disconnect"),
                cleanup_required,
                "stage={stage}"
            );
            let next = match stage {
                "adapter" => Some("scan"),
                "scan" => Some("connect"),
                "connect" => Some("discover"),
                "discover" => Some("subscribe"),
                "subscribe" => Some("properties"),
                _ => None,
            };
            if let Some(next) = next {
                assert!(
                    !events.iter().any(|event| event == &format!("1:{next}")),
                    "cancelled stage={stage} started {next}"
                );
            }
        }
    }

    #[tokio::test]
    async fn connect_and_setup_failures_cleanup_even_partial_connections_and_report_cleanup_errors()
    {
        for failures in [
            &["connect"][..],
            &["subscribe"][..],
            &["connect", "disconnect"][..],
        ] {
            let coordinator = Coordinator::default();
            let slot = Mutex::new(None);
            let events = Events::default();
            let backend = Fake::new(1, None, failures, events.clone());
            let error = establish(&coordinator, &slot, &*backend, |_, _, _| {
                panic!("failed attempt published")
            })
            .await
            .unwrap_err();
            assert!(error.contains(failures[0]));
            assert_eq!(
                error.contains("cleanup failed"),
                failures.contains(&"disconnect")
            );
            assert!(slot.lock().await.is_none());
            assert!(events
                .lock()
                .unwrap()
                .iter()
                .any(|event| event == "1:disconnect-target:1"));
        }
    }

    #[tokio::test]
    async fn replacement_waits_for_stale_attempt_cleanup_before_connecting() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(None));
        let events = Events::default();
        let first = Fake::new(1, Some("connect"), &[], events.clone());
        first.pause_cleanup.store(true, Ordering::SeqCst);
        let second = Fake::new(2, None, &[], events.clone());
        let old = start(coordinator.clone(), slot.clone(), first.clone());
        first.entered.notified().await;
        let (reserved_tx, reserved_rx) = tokio::sync::oneshot::channel();
        let new = {
            let (coordinator, slot, second) = (coordinator.clone(), slot.clone(), second.clone());
            tokio::spawn(async move {
                reserved_tx.send(()).unwrap();
                establish(&coordinator, &slot, &*second, |_, id, _| {
                    second
                        .events
                        .lock()
                        .unwrap()
                        .push(format!("connected:{id}"))
                })
                .await
            })
        };
        reserved_rx.await.unwrap(); // 單執行緒 runtime：新嘗試已執行至 attempts 等待點。
        assert!(coordinator.check(1).is_err());
        first.release.add_permits(1);
        first.entered.notified().await; // 舊清理尚未完成，新連線不可開始。
        assert!(!events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event == "2:connect"));
        first.release.add_permits(1);
        assert!(old.await.unwrap().is_err());
        assert_eq!(new.await.unwrap().unwrap(), "device-2");
        assert_eq!(*slot.lock().await, Some(2));
        let events = events.lock().unwrap();
        let cleaned = events
            .iter()
            .position(|event| event == "1:disconnect")
            .unwrap();
        let replacement = events
            .iter()
            .position(|event| event == "2:connect")
            .unwrap();
        assert!(cleaned < replacement);
        assert!(!events.iter().any(|event| event == "connected:1"));
    }

    #[tokio::test]
    async fn queued_attempt_cancelled_before_its_permit_does_no_native_work() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(None));
        let events = Events::default();
        let first = Fake::new(1, Some("connect"), &[], events.clone());
        let second = Fake::new(2, None, &[], events.clone());
        let old = start(coordinator.clone(), slot.clone(), first.clone());
        first.entered.notified().await;
        let queued = start(coordinator.clone(), slot.clone(), second.clone());
        tokio::task::yield_now().await;
        disconnect(&coordinator, &slot, &*second, |_| {})
            .await
            .unwrap();
        first.release.add_permits(1);
        assert!(old.await.unwrap().is_err());
        assert!(queued.await.unwrap().is_err());
        assert!(!events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event.starts_with("2:")));
        let third = Fake::new(3, None, &[], events);
        assert_eq!(
            establish(&coordinator, &slot, &*third, |_, _, _| {})
                .await
                .unwrap(),
            "device-3"
        );
        assert_eq!(*slot.lock().await, Some(3));
    }

    #[tokio::test]
    async fn cancellation_preserves_simultaneous_backend_and_cleanup_errors() {
        for (stage, failures, expected) in [
            ("scan", &["stop_scan"][..], "stop_scan failed"),
            ("connect", &["connect", "disconnect"][..], "connect failed"),
            ("subscribe", &["subscribe"][..], "subscribe failed"),
        ] {
            let coordinator = Arc::new(Coordinator::default());
            let slot = Arc::new(Mutex::new(None));
            let backend = Fake::new(1, Some(stage), failures, Events::default());
            let task = start(coordinator.clone(), slot.clone(), backend.clone());
            backend.entered.notified().await;
            coordinator.begin();
            backend.release.add_permits(1);
            let error = task.await.unwrap().unwrap_err();
            assert!(error.contains(CANCELLED));
            assert!(error.contains(expected), "{error}");
            if stage == "connect" {
                assert!(error.contains("cleanup failed"));
            }
            assert!(slot.lock().await.is_none());
        }
    }

    #[tokio::test]
    async fn immediate_listener_completion_is_not_overwritten_by_late_installation() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(None));
        let events = Events::default();
        let backend = Fake::new(1, None, &[], events.clone());
        let listener = RecordMutex::new(None);
        establish(&coordinator, &slot, &*backend, |generation, _, _| {
            assert!(slot.try_lock().is_err());
            events.lock().unwrap().push("connected".into());
            let (coordinator, slot, events) = (coordinator.clone(), slot.clone(), events.clone());
            *listener.lock().unwrap() = Some(tokio::spawn(async move {
                coordinator
                    .with_peripheral(&slot, generation, |slot| {
                        *slot = None;
                        events.lock().unwrap().push("stream-ended".into());
                    })
                    .await;
            }));
        })
        .await
        .unwrap();
        let listener = listener.lock().unwrap().take().unwrap();
        listener.await.unwrap();
        assert!(slot.lock().await.is_none());
        let events = events.lock().unwrap();
        assert!(
            events
                .iter()
                .position(|event| event == "connected")
                .unwrap()
                < events
                    .iter()
                    .position(|event| event == "stream-ended")
                    .unwrap()
        );
    }

    #[tokio::test]
    async fn cancelled_install_waiting_for_peripheral_cleans_up_without_publication() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(None));
        let events = Events::default();
        let backend = Fake::new(1, Some("properties"), &[], events.clone());
        let attempt = start(coordinator.clone(), slot.clone(), backend.clone());
        backend.entered.notified().await;
        let held = slot.lock().await;
        backend.release.add_permits(1);
        tokio::task::yield_now().await;
        coordinator.begin();
        drop(held);
        assert!(attempt.await.unwrap().is_err());
        assert!(slot.lock().await.is_none());
        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| event == "1:disconnect"));
        assert!(!events.iter().any(|event| event.starts_with("connected:")));
    }

    #[tokio::test]
    async fn superseded_disconnect_waiting_for_slot_neither_takes_handle_nor_publishes() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(Some(7)));
        let events = Events::default();
        let backend = Fake::new(1, None, &[], events.clone());
        let held = slot.lock().await;
        let pending = {
            let (coordinator, slot) = (coordinator.clone(), slot.clone());
            tokio::spawn(async move {
                disconnect(&coordinator, &slot, &*backend, |_| {
                    panic!("stale disconnect published")
                })
                .await
            })
        };
        tokio::task::yield_now().await;
        coordinator.begin();
        drop(held);
        pending.await.unwrap().unwrap();
        assert_eq!(*slot.lock().await, Some(7));
        assert!(events.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn newer_intent_during_os_disconnect_suppresses_stale_disconnected_event() {
        let coordinator = Arc::new(Coordinator::default());
        let slot = Arc::new(Mutex::new(Some(7)));
        let events = Events::default();
        let backend = Fake::new(1, Some("disconnect"), &[], events.clone());
        let pending = {
            let (coordinator, slot, backend) = (coordinator.clone(), slot.clone(), backend.clone());
            tokio::spawn(async move {
                disconnect(&coordinator, &slot, &*backend, |_| {
                    panic!("old intent published")
                })
                .await
            })
        };
        backend.entered.notified().await;
        coordinator.begin();
        backend.release.add_permits(1);
        pending.await.unwrap().unwrap();
        assert!(slot.lock().await.is_none());
    }
}
