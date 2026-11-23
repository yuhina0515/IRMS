//! 有序裝置回饋與原生語音；UI 不等待 BLE/COM，舊世代工作不會寫入新裝置。
use crate::{NativeHost, Receipt};
use irms_core::ble;
use irms_core::ble_lifecycle::CANCELLED;
use irms_core::session_controller::{Cue, Effect};
use serde_json::json;
use std::future::Future;
use std::sync::mpsc;
use std::time::Duration;

type Events = mpsc::Sender<(Receipt, String, serde_json::Value)>;

/// 超時只通報，不拋棄仍由 OS 執行的操作，避免錯誤釋放連線所有權。
async fn watched(
    future: impl Future<Output = Result<(), String>>,
    events: &Events,
    label: &str,
    delay: Duration,
) -> Result<(), String> {
    tokio::pin!(future);
    tokio::select! {
        result = &mut future => result,
        _ = tokio::time::sleep(delay) => {
            let _ = events.send((Receipt::now(), "native:feedback-wait".into(), json!(format!("{label}超過 15 秒，仍在等待裝置完成收尾"))));
            future.await
        }
    }
}

enum Job {
    Command(u64, String),
    Disconnect(Option<u64>, bool),
}
enum Speech {
    Say(String),
    Stop,
}

// 小型傳輸契約讓同一條佇列執行路徑可用假裝置驗證失敗與收尾順序。
trait Device {
    fn command(&self, epoch: u64, text: String) -> impl Future<Output = Result<(), String>> + Send;
    fn disconnect(&self, epoch: Option<u64>) -> impl Future<Output = Result<(), String>> + Send;
}
impl Device for NativeHost {
    async fn command(&self, epoch: u64, text: String) -> Result<(), String> {
        ble::ble_send_command_for_generation(self, &self.state, text, epoch).await
    }
    async fn disconnect(&self, epoch: Option<u64>) -> Result<(), String> {
        match epoch {
            Some(epoch) => ble::ble_disconnect_for_generation(self, &self.state, epoch).await,
            None => ble::ble_disconnect(self, &self.state).await,
        }
    }
}
async fn execute_job(job: Job, device: &impl Device, events: &Events) {
    let report = |epoch, error| {
        let _ = events.send((
            Receipt::now(),
            "native:feedback-error".into(),
            json!({"message":error,"generation":epoch}),
        ));
    };
    match job {
        Job::Command(epoch, text) => {
            if let Err(error) = watched(
                device.command(epoch, text),
                events,
                "裝置指令",
                Duration::from_secs(15),
            )
            .await
            {
                if error != CANCELLED {
                    report(epoch, error);
                    if let Err(error) = watched(
                        device.disconnect(Some(epoch)),
                        events,
                        "裝置斷線",
                        Duration::from_secs(15),
                    )
                    .await
                    {
                        report(epoch, error);
                    }
                }
            }
        }
        Job::Disconnect(epoch, closing) => {
            // 關窗已封鎖重連，必須清理目前殘留的 handle，不能把舊世代跳過當成成功。
            let result = watched(
                device.disconnect(if closing { None } else { epoch }),
                events,
                "裝置斷線",
                Duration::from_secs(15),
            )
            .await;
            let _ = events.send((
                Receipt::now(),
                if closing {
                    "native:shutdown"
                } else {
                    "native:disconnected"
                }
                .into(),
                json!({"error": result.err()}),
            ));
        }
    }
}

pub struct Outputs {
    commands: tokio::sync::mpsc::Sender<Job>,
    speech: mpsc::Sender<Speech>,
    host: Option<NativeHost>,
    events: mpsc::Sender<(Receipt, String, serde_json::Value)>,
}
impl Outputs {
    /// 單一 BLE 工作者保留 LED_OFF → GOAL 等協定順序，佇列滿時明確中止連線。
    pub fn new(
        host: Option<NativeHost>,
        rt: &tokio::runtime::Handle,
        events: mpsc::Sender<(Receipt, String, serde_json::Value)>,
    ) -> Self {
        let (commands, mut rx) = tokio::sync::mpsc::channel(64);
        let worker_host = host.clone();
        let worker_events = events.clone();
        rt.spawn(async move {
            while let Some(job) = rx.recv().await {
                if let Some(host) = &worker_host {
                    execute_job(job, host, &worker_events).await;
                }
            }
        });
        let (speech, rx) = mpsc::channel();
        let speech_events = events.clone();
        std::thread::spawn(move || speech_loop(rx, speech_events));
        Self {
            commands,
            speech,
            host,
            events,
        }
    }
    pub fn dispatch(&self, effects: Vec<Effect>, epoch: Option<u64>, voice_enabled: bool) {
        for effect in effects {
            match effect {
                Effect::Command(command) => {
                    if let (Some(epoch), Some(host)) = (epoch, self.host.as_ref()) {
                        if self
                            .commands
                            .try_send(Job::Command(epoch, command.wire().into()))
                            .is_err()
                        {
                            let _ = self.events.send((
                                Receipt::now(),
                                "native:feedback-error".into(),
                                json!({"message":"裝置回饋佇列已滿，停止連線","generation":epoch}),
                            ));
                            let host = host.clone();
                            let rt = host.rt.clone();
                            rt.spawn(async move {
                                let _ =
                                    ble::ble_disconnect_for_generation(&host, &host.state, epoch)
                                        .await;
                            });
                        }
                    }
                }
                Effect::Speak(cue) if voice_enabled => {
                    let _ = self.speech.send(Speech::Say(cue.text()));
                }
                Effect::StopSpeech => {
                    let _ = self.speech.send(Speech::Stop);
                }
                _ => {}
            }
        }
    }
    pub fn saved(&self, reps: u32, voice_enabled: bool) {
        self.dispatch(vec![Effect::Speak(Cue::End(reps))], None, voice_enabled);
    }
    /// 結束前排在 OFF 指令之後，等待裝置收尾完成才讓 UI 關閉。
    pub fn disconnect(&self, epoch: Option<u64>, closing: bool) {
        let tx = self.commands.clone();
        if let Some(host) = &self.host {
            host.rt.spawn(async move {
                let _ = tx.send(Job::Disconnect(epoch, closing)).await;
            });
        }
    }
}

#[cfg(windows)]
fn speech_loop(
    rx: mpsc::Receiver<Speech>,
    events: mpsc::Sender<(Receipt, String, serde_json::Value)>,
) {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Media::Speech::{
        ISpObjectTokenCategory, ISpVoice, SpObjectTokenCategory, SpVoice, SPCAT_VOICES, SPF_ASYNC,
        SPF_PURGEBEFORESPEAK,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    let notify = |message: &str| {
        let _ = events.send((Receipt::now(), "native:voice-status".into(), json!(message)));
    };
    // 所有 COM 物件在同一個專用執行緒建立、使用及釋放。
    unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
            notify("系統語音無法初始化");
            return;
        }
        let voice: windows::core::Result<ISpVoice> = CoCreateInstance(&SpVoice, None, CLSCTX_ALL);
        if let Ok(voice) = voice {
            let selected = (|| -> windows::core::Result<bool> {
                let category: ISpObjectTokenCategory =
                    CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL)?;
                category.SetId(SPCAT_VOICES, false)?;
                let tokens = category.EnumTokens(w!("Language=404"), PCWSTR::null())?;
                let mut token = None;
                tokens.Next(1, &mut token, None)?;
                if let Some(token) = token {
                    voice.SetVoice(&token)?;
                    return Ok(true);
                }
                Ok(false)
            })()
            .unwrap_or(false);
            notify(if selected {
                "繁中系統語音已就緒"
            } else {
                "未找到繁中語音，使用系統預設語音"
            });
            while let Ok(message) = rx.recv() {
                let text = match message {
                    Speech::Say(text) => text,
                    Speech::Stop => String::new(),
                };
                let text: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
                if voice
                    .Speak(
                        PCWSTR(text.as_ptr()),
                        (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32,
                        None,
                    )
                    .is_err()
                {
                    notify("系統語音播放失敗，療程與畫面仍可使用");
                }
            }
            let _ = voice.Speak(w!(""), SPF_PURGEBEFORESPEAK.0 as u32, None);
        } else {
            notify("未提供可用的系統語音");
        }
        CoUninitialize();
    }
}
#[cfg(not(windows))]
fn speech_loop(
    _rx: mpsc::Receiver<Speech>,
    _events: mpsc::Sender<(Receipt, String, serde_json::Value)>,
) {
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn queued_close_retries_retained_cleanup_after_command_and_disconnect_fail() {
        #[derive(Default)]
        struct Fake {
            calls: std::sync::Mutex<Vec<String>>,
        }
        impl Device for Fake {
            async fn command(&self, _epoch: u64, text: String) -> Result<(), String> {
                self.calls.lock().unwrap().push(text);
                Err("write failed".into())
            }
            async fn disconnect(&self, epoch: Option<u64>) -> Result<(), String> {
                self.calls
                    .lock()
                    .unwrap()
                    .push(format!("disconnect {epoch:?}"));
                if epoch.is_some() {
                    Err("cleanup failed, handle retained".into())
                } else {
                    Ok(())
                }
            }
        }
        let (tx, rx) = mpsc::channel();
        let fake = Fake::default();
        execute_job(Job::Command(7, "CMD:LED_OFF".into()), &fake, &tx).await;
        execute_job(Job::Disconnect(Some(7), true), &fake, &tx).await;
        assert_eq!(
            *fake.calls.lock().unwrap(),
            vec!["CMD:LED_OFF", "disconnect Some(7)", "disconnect None"]
        );
        let events: Vec<_> = rx.try_iter().collect();
        assert_eq!(
            events
                .iter()
                .filter(|e| e.1 == "native:feedback-error")
                .count(),
            2
        );
        assert_eq!(events.last().unwrap().1, "native:shutdown");
        assert!(events.last().unwrap().2["error"].is_null());
    }
    #[tokio::test]
    async fn watchdog_reports_wait_without_dropping_the_device_operation() {
        let (tx, rx) = mpsc::channel();
        let release = std::sync::Arc::new(tokio::sync::Notify::new());
        let gate = release.clone();
        let task = tokio::spawn(async move {
            watched(
                async move {
                    gate.notified().await;
                    Ok(())
                },
                &tx,
                "test",
                Duration::from_millis(1),
            )
            .await
        });
        let event = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if let Ok(event) = rx.try_recv() {
                    break event;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(event.1, "native:feedback-wait");
        assert!(!task.is_finished());
        release.notify_one();
        task.await.unwrap().unwrap();
    }
}
