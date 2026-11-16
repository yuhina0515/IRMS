//! Single running instance of the default installation.
//!
//! A second launch brings the running window to the front and exits instead of failing on the
//! database lock. Only the default database is guarded: an explicit `--db` path is a separate
//! store (its own file lock) and may run beside it.

#[cfg(windows)]
pub struct Guard(windows::Win32::Foundation::HANDLE);

#[cfg(not(windows))]
pub struct Guard;

#[cfg(windows)]
impl Drop for Guard {
    fn drop(&mut self) {
        // SAFETY: the handle came from CreateMutexW and is closed once.
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

pub enum Outcome {
    /// This process is the instance (or the check is not applicable).
    First(Option<Guard>),
    /// Another instance was running and has been asked to show itself.
    Second,
}

#[cfg(windows)]
pub fn acquire(window_title: &str) -> Outcome {
    use windows::core::{w, HSTRING};
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };
    // SAFETY: plain Win32 calls with valid arguments; handles are owned by the returned guard.
    unsafe {
        let Ok(handle) = CreateMutexW(None, false, w!(r"Local\IRMSNativeBeta.SingleInstance"))
        else {
            return Outcome::First(None);
        };
        if GetLastError() == ERROR_ALREADY_EXISTS {
            if let Ok(existing) = FindWindowW(None, &HSTRING::from(window_title)) {
                let _ = ShowWindow(existing, SW_RESTORE);
                let _ = SetForegroundWindow(existing);
            }
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            return Outcome::Second;
        }
        Outcome::First(Some(Guard(handle)))
    }
}

#[cfg(not(windows))]
pub fn acquire(_window_title: &str) -> Outcome {
    Outcome::First(None)
}
