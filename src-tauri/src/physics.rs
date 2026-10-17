//! A separate, click-through monitor canvas keeps falling food above the widget viewport.
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let overlay = WebviewWindowBuilder::new(app, "physics", WebviewUrl::App("html/physics.html".into()))
        .title("Whale tableware").transparent(true).decorations(false).shadow(false)
        .always_on_top(true).skip_taskbar(true).focused(false).resizable(false)
        .visible(false).inner_size(625.0, 625.0).build()?;
    overlay.set_ignore_cursor_events(true)?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetRect { x: f64, y: f64, width: f64, height: f64, left: bool, sound: bool, volume: f64 }

#[tauri::command]
pub fn sync_physics(window: WebviewWindow, pet: PetRect, action: Option<String>) -> Result<(), String> {
    if window.label() != "widget" { return Err("widget only".into()); }
    let app = window.app_handle();
    let overlay = app.get_webview_window("physics").ok_or("physics unavailable")?;
    let monitor = window.current_monitor().map_err(|e| e.to_string())?.ok_or("monitor unavailable")?;
    let origin = monitor.position();
    let size = monitor.size();
    if overlay.outer_position().ok().as_ref() != Some(origin) {
        overlay.set_position(*origin).map_err(|e| e.to_string())?;
    }
    if overlay.inner_size().ok().as_ref() != Some(size) {
        overlay.set_size(*size).map_err(|e| e.to_string())?;
    }
    let sf = window.scale_factor().unwrap_or(1.0);
    let osf = overlay.scale_factor().unwrap_or(sf);
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let geometry = json!({
        "x": (pos.x as f64 + pet.x * sf - origin.x as f64) / osf,
        "y": (pos.y as f64 + pet.y * sf - origin.y as f64) / osf,
        "width": pet.width * sf / osf, "height": pet.height * sf / osf,
        "left": pet.left, "sound": pet.sound, "volume": pet.volume,
        "floor": (monitor.work_area().position.y as f64 + monitor.work_area().size.height as f64 - origin.y as f64) / osf,
        "monitor": format!("{},{}",origin.x,origin.y), "action": action
    });
    if action.as_deref().is_some_and(|a| a != "clear") { overlay.show().map_err(|e| e.to_string())?; }
    overlay.emit("physics-sync", geometry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn physics_feedback(window: WebviewWindow, count: usize, feeding: bool, message: Option<String>) {
    if window.label() != "physics" { return; }
    let _ = window.emit_to("widget", "physics-state", json!({"count":count,"feeding":feeding,"message":message}));
    if count == 0 { let _ = window.set_ignore_cursor_events(true); let _ = window.hide(); }
}

#[tauri::command]
pub fn physics_cursor(window: WebviewWindow) -> Option<(f64, f64)> {
    let pos = window.outer_position().ok()?;
    let sf = window.scale_factor().ok()?;
    let (x,y) = crate::api::window_api::get_cursor_position(window);
    Some((x - pos.x as f64 / sf, y - pos.y as f64 / sf))
}
