//! A separate, click-through monitor canvas keeps falling food above the widget viewport.
use serde::{Deserialize,Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};

pub fn create(app: &AppHandle, owner: &WebviewWindow) -> tauri::Result<()> {
    let overlay = WebviewWindowBuilder::new(app, "physics", WebviewUrl::App("html/physics.html".into()))
        // Windows owned popups stay above their owner even when the pet gains focus.
        .parent(owner)?
        .title("Whale tableware").transparent(true).decorations(false).shadow(false)
        .always_on_top(true).skip_taskbar(true).focused(false).resizable(false)
        .visible(false).inner_size(625.0, 625.0).build()?;
    overlay.set_ignore_cursor_events(true)?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetRect { x: f64, y: f64, width: f64, height: f64, left: bool, #[serde(default)] group:String, #[serde(default)] shields:Vec<Shield>, #[serde(default)] character_sound: bool, sound: bool, volume: f64 }

#[derive(Deserialize,Serialize)]
pub struct Shield {d:String,matrix:[f64;6],stroke:f64}

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
    let shields:Vec<Shield>=pet.shields.into_iter().take(8).filter(|s|s.d.len()<4096 && s.matrix.iter().all(|v|v.is_finite()) && s.stroke.is_finite()).map(|mut s|{
        for v in &mut s.matrix[..4]{*v*=sf/osf;}
        s.matrix[4]=(pos.x as f64+s.matrix[4]*sf-origin.x as f64)/osf;
        s.matrix[5]=(pos.y as f64+s.matrix[5]*sf-origin.y as f64)/osf;s
    }).collect();
    let geometry = json!({
        "x": (pos.x as f64 + pet.x * sf - origin.x as f64) / osf,
        "y": (pos.y as f64 + pet.y * sf - origin.y as f64) / osf,
        "width": pet.width * sf / osf, "height": pet.height * sf / osf,
        "left": pet.left, "characterSound": pet.character_sound, "sound": pet.sound, "volume": pet.volume,
        "group":pet.group,"shields":shields,
        "floor": (monitor.work_area().position.y as f64 + monitor.work_area().size.height as f64 - origin.y as f64) / osf,
        "monitor": format!("{},{}",origin.x,origin.y), "action": action
    });
    if action.as_deref().is_some_and(|a| a != "clear") { overlay.show().map_err(|e| e.to_string())?; }
    overlay.emit("physics-sync", geometry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn physics_feedback(window: WebviewWindow, count: usize, feeding: bool, message: Option<String>, cue: Option<String>) {
    if window.label() != "physics" { return; }
    let _ = window.emit_to("widget", "physics-state", json!({"count":count,"feeding":feeding,"message":message,"cue":cue}));
    if count == 0 { let _ = window.set_ignore_cursor_events(true); let _ = window.hide(); }
}

#[tauri::command]
pub fn physics_cursor(window: WebviewWindow) -> Option<(f64, f64, bool)> {
    let pos = window.outer_position().ok()?;
    let sf = window.scale_factor().ok()?;
    let (x,y) = crate::api::window_api::get_cursor_position(window);
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState,VK_LBUTTON};
    let held=unsafe{GetAsyncKeyState(VK_LBUTTON.0 as i32)}<0;
    Some((x - pos.x as f64 / sf, y - pos.y as f64 / sf,held))
}
