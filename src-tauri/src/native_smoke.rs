//! Opt-in integration harness. Never compiled into the distributed binary.
use tauri::{Emitter, Listener, Manager};
use serde_json::json;
use std::{fs, io::Write, time::Duration};

pub fn start(app: &tauri::AppHandle) {
    if !std::env::args().any(|s| s == "--whale-smoke") { return; }
    let dir = crate::infrastructure::system::paths::app_data_dir();
    let home = std::env::var_os("CODEX_HOME").map(std::path::PathBuf::from).expect("isolated CODEX_HOME required");
    assert!(home.starts_with(dir.parent().unwrap()), "smoke tests must not touch real Codex logs");
    let report = dir.join("native-smoke.jsonl");
    fs::write(&report, "").unwrap();
    let host = app.clone();
    app.listen("smoke-report", move |event| {
        let mut f=fs::OpenOptions::new().append(true).open(&report).unwrap();
        writeln!(f,"{}",event.payload()).unwrap();
        if let Some(w)=host.get_webview_window("physics") {
            let geometry=json!({"nativeGeometry":{"position":w.outer_position().ok(),"size":w.inner_size().ok(),"scale":w.scale_factor().ok(),"visible":w.is_visible().ok()}});
            writeln!(f,"{geometry}").unwrap();
            #[cfg(windows)]
            if let Some(pet)=host.get_webview_window("widget") {
                use windows::Win32::UI::WindowsAndMessaging::{GetWindow,GW_OWNER,GW_HWNDPREV};
                use windows::Win32::Foundation::HWND;
                let ph=HWND(pet.hwnd().unwrap().0);let wh=HWND(w.hwnd().unwrap().0);
                let owner=unsafe{GetWindow(wh,GW_OWNER)}.ok()==Some(ph);
                let mut above=false;let mut current=ph;
                for _ in 0..1000 {
                    let Ok(previous)=(unsafe{GetWindow(current,GW_HWNDPREV)}) else {break;};
                    if previous==wh {above=true;break;}
                    if previous.0.is_null(){break;}current=previous;
                }
                writeln!(f,"{}",json!({"nativeLayering":{"ownedByPet":owner,"abovePet":above,"visible":w.is_visible().unwrap_or(false)}})).unwrap();
            }
        }
    });
    app.listen("smoke-fixture", move |event| {
        let session=home.join("sessions/2026/10/17/rollout-2026-10-17T00-00-00-22222222-2222-4222-8222-222222222222.jsonl");
        fs::create_dir_all(session.parent().unwrap()).unwrap();
        let now=chrono::Utc::now().to_rfc3339();
        let line=|kind:&str,p:serde_json::Value| json!({"timestamp":now,"type":kind,"payload":p}).to_string()+"\n";
        if event.payload().contains("start") {
            let mut content=line("session_meta",json!({"id":"22222222-2222-4222-8222-222222222222"}));
            content+=&line("event_msg",json!({"type":"task_started","turn_id":"smoke-turn"}));
            content+=&line("turn_context",json!({"turn_id":"smoke-turn","model":"native-smoke"}));
            for i in 0..3 {content+=&line("token_usage_record",json!({"turn_id":"smoke-turn","response_id":format!("smoke-{i}"),"usage":{"input_tokens":100,"output_tokens":20},"turn_token_usage":{"input_tokens":(i+1)*100,"output_tokens":(i+1)*20}}));}
            fs::write(session,content).unwrap();
        } else {
            let mut f=fs::OpenOptions::new().append(true).open(session).unwrap();
            f.write_all(line("event_msg",json!({"type":"task_complete","turn_id":"smoke-turn"})).as_bytes()).unwrap();
        }
    });
    let handle=app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        if let Some(w)=handle.get_webview_window("physics") {
            let _=w.eval(include_str!("../tests/native-physics.js"));
        }
        if let Some(w)=handle.get_webview_window("widget") {
            let _=w.eval(include_str!("../tests/native-widget.js"));
        }
        let _=handle.emit("smoke-running",true);
    });
}
