//! Restore the pet's actual z-order when another topmost window covers it.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Manager};
use windows::Win32::{
    Foundation::{HWND, RECT},
    UI::{
        Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
        WindowsAndMessaging::*,
    },
};

struct Watch {
    app: AppHandle,
    enabled: AtomicBool,
    pending: AtomicBool,
    hooks: Mutex<Vec<isize>>,
}

static WATCH: OnceLock<Watch> = OnceLock::new();

/// Install on Tauri's event-loop thread, which pumps out-of-context WinEvents.
pub fn start(app: &AppHandle) {
    let watch = WATCH.get_or_init(|| Watch {
        app: app.clone(),
        enabled: AtomicBool::new(crate::companion::get_companion_settings().always_on_top),
        pending: AtomicBool::new(false),
        hooks: Mutex::new(Vec::new()),
    });
    let mut hooks = watch.hooks.lock().unwrap();
    if !hooks.is_empty() {
        return;
    }
    for (first, last) in [
        (EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND),
        (EVENT_OBJECT_SHOW, EVENT_OBJECT_REORDER),
    ] {
        let hook = unsafe {
            SetWinEventHook(
                first,
                last,
                None,
                Some(on_event),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            )
        };
        if hook.0.is_null() {
            log::warn!(
                "Could not install topmost event hook: {}",
                std::io::Error::last_os_error()
            );
        } else {
            hooks.push(hook.0 as isize);
        }
    }
}

pub fn stop() {
    if let Some(watch) = WATCH.get() {
        watch.enabled.store(false, Ordering::Release);
        for hook in watch.hooks.lock().unwrap().drain(..) {
            unsafe {
                let _ = UnhookWinEvent(HWINEVENTHOOK(hook as _));
            }
        }
    }
}

pub fn set_enabled(enabled: bool) {
    if let Some(watch) = WATCH.get() {
        watch.enabled.store(enabled, Ordering::Release);
    }
}

unsafe extern "system" fn on_event(
    _: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    object: i32,
    child: i32,
    _: u32,
    _: u32,
) {
    if hwnd.0.is_null()
        || (event != EVENT_SYSTEM_FOREGROUND
            && (object != OBJID_WINDOW.0
                || child != CHILDID_SELF as i32
                || !matches!(event, EVENT_OBJECT_SHOW | EVENT_OBJECT_REORDER)))
    {
        return;
    }
    if GetAncestor(hwnd, GA_ROOT) != hwnd {
        return;
    }
    let Some(watch) = WATCH.get() else {
        return;
    };
    if !watch.enabled.load(Ordering::Acquire) || watch.pending.swap(true, Ordering::AcqRel) {
        return;
    }
    // Coalesce event bursts and leave the native callback before adjusting windows.
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        if watch
            .app
            .run_on_main_thread(move || {
                watch.pending.store(false, Ordering::Release);
                refresh(&watch.app, false);
            })
            .is_err()
        {
            watch.pending.store(false, Ordering::Release);
        }
    });
}

/// A show or settings action also needs a real raise, even if Tao caches ON_TOP=true.
pub fn request_refresh(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || refresh(&handle, true));
}

fn refresh(app: &AppHandle, force: bool) {
    let Some(watch) = WATCH.get() else {
        return;
    };
    if !watch.enabled.load(Ordering::Acquire) {
        return;
    }
    let Some(pet) = app.get_webview_window("widget").and_then(|w| w.hwnd().ok()) else {
        return;
    };
    let pet = HWND(pet.0);
    // No SHOWWINDOW or restore: user-hidden/minimized pets must stay hidden.
    if !unsafe { IsWindowVisible(pet).as_bool() } || unsafe { IsIconic(pet).as_bool() } {
        return;
    }
    let overlay = app
        .get_webview_window("physics")
        .and_then(|w| w.hwnd().ok())
        .map(|h| HWND(h.0));
    let visible =
        overlay.filter(|&h| unsafe { IsWindowVisible(h).as_bool() && !IsIconic(h).as_bool() });
    if !force && !needs_raise(pet, visible) {
        return;
    }
    // Raising an owner also moves its owned popups. Raise the overlay last to keep
    // tableware above the pet; its SVG cutouts still keep speech bubbles readable.
    for hwnd in [Some(pet), visible].into_iter().flatten() {
        if let Err(error) = unsafe {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
        } {
            log::warn!("Could not restore pet z-order: {error}");
        }
    }
}

fn needs_raise(pet: HWND, overlay: Option<HWND>) -> bool {
    let mut areas = Vec::new();
    for hwnd in [Some(pet), overlay].into_iter().flatten() {
        if unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 } & WS_EX_TOPMOST.0 == 0 {
            return true;
        }
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_ok() {
            areas.push(rect);
        }
    }
    let mut current = pet;
    for _ in 0..4096 {
        let Ok(previous) = (unsafe { GetWindow(current, GW_HWNDPREV) }) else {
            break;
        };
        if previous.0.is_null() {
            break;
        }
        current = previous;
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(current, Some(&mut pid));
        }
        if pid == std::process::id()
            || !unsafe { IsWindowVisible(current).as_bool() }
            || unsafe { IsIconic(current).as_bool() }
            || transient_or_shell(current)
        {
            continue;
        }
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(current, &mut rect) }.is_ok()
            && areas.iter().any(|area| overlaps(area, &rect))
        {
            return true;
        }
    }
    false
}

fn transient_or_shell(hwnd: HWND) -> bool {
    let mut name = [0u16; 128];
    let len = unsafe { GetClassNameW(hwnd, &mut name) } as usize;
    matches!(
        String::from_utf16_lossy(&name[..len]).as_str(),
        "#32768"
            | "tooltips_class32"
            | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "Progman"
            | "WorkerW"
            | "MultitaskingViewFrame"
            | "XamlExplorerHostIslandWindow"
    )
}

fn overlaps(a: &RECT, b: &RECT) -> bool {
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}
