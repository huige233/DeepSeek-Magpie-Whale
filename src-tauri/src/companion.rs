//! Read-only Magpie/Codex adapters. Only this app's settings are written.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet, VecDeque}, fs::{self, File}, io::{BufRead, BufReader, Read, Seek, SeekFrom}, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::Duration};
use tauri::Emitter;
use crate::infrastructure::system::paths::app_data_dir;
#[path = "usage_sources.rs"]
pub(crate) mod sources;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub account_id: String,
    pub port: u16,
    pub notifications: bool,
    pub rice_on_completion: bool,
    pub character_dialogue: bool,
    pub codex_enabled: bool,
    pub notification_seconds: u32,
    pub notification_placement: String,
    pub font_family: String,
    pub font_scale: f64,
    pub component_sounds: HashMap<String, String>,
    pub character_sounds: HashMap<String, HashMap<String,String>>,
    pub character_sound_enabled: HashMap<String,bool>,
    pub usage_sources: HashMap<String, sources::SourceSettings>,
    pub character_lines: HashMap<String, HashMap<String, Vec<String>>>,
}
impl Default for Settings {
    fn default() -> Self { Self { account_id: String::new(), port: 3425, notifications: true, rice_on_completion: false, character_dialogue: true, codex_enabled: true, notification_seconds: 12, notification_placement: "inside".into(), font_family: "Microsoft YaHei UI".into(), font_scale: 1.0, component_sounds: HashMap::new(), character_sounds: HashMap::new(), character_sound_enabled: HashMap::new(), usage_sources: HashMap::new(), character_lines: HashMap::new() } }
}
fn settings_path() -> PathBuf { app_data_dir().join("magpie.json") }
#[tauri::command]
pub fn get_companion_settings() -> Settings {
    fs::read(settings_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}
#[tauri::command]
pub fn save_companion_settings(app: tauri::AppHandle, mut settings: Settings) -> Result<Settings, String> {
    if settings.port == 0 { return Err("端口应为 1–65535".into()); }
    sources::validate_settings(&mut settings)?;
    settings.notification_seconds = settings.notification_seconds.clamp(5, 120);
    if settings.notification_placement != "above" { settings.notification_placement = "inside".into(); }
    settings.font_scale = if settings.font_scale.is_finite() { settings.font_scale.clamp(0.8, 1.4) } else { 1.0 };
    settings.font_family = settings.font_family.trim().chars().filter(|c| !c.is_control()).take(100).collect();
    if settings.font_family.is_empty() { settings.font_family = "Microsoft YaHei UI".into(); }
    settings.component_sounds.retain(|key,value| crate::component_audio::valid_event(key) && crate::component_audio::valid_choice(value));
    settings.character_sound_enabled.retain(|group,_| crate::character::valid_group(group));
    settings.character_sounds.retain(|group,cues| {
        cues.retain(|cue,choice| crate::character::valid_cue(cue) && crate::component_audio::valid_choice(choice) && choice != "anvil");
        crate::character::valid_group(group)
    });
    fs::write(settings_path(), serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _ = app.emit("companion-settings-changed", &settings);
    Ok(settings)
}
async fn magpie_get(port: u16, route: &str) -> Result<Value, String> {
    // No credentials, remote hosts, redirects, or system proxy for local data.
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(6)).build().map_err(|e| e.to_string())?;
    let response = client.get(format!("http://127.0.0.1:{port}{route}")).send().await
        .map_err(|_| format!("未连接 Magpie（本机端口 {port}），请确认 Magpie 正在运行"))?;
    if !response.status().is_success() { return Err(format!("Magpie 返回 {}", response.status())); }
    response.json().await.map_err(|_| "Magpie 返回的数据无法识别".into())
}
#[tauri::command]
pub async fn get_magpie_quotas() -> Result<Value, String> {
    magpie_get(get_companion_settings().port, "/v1/magpie/quotas").await
}

#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens { pub input: u64, pub output: u64, pub cached: u64, pub reasoning: u64 }
impl Tokens {
    fn total(&self) -> u64 { self.input.saturating_add(self.output) }
    fn from_codex(v: &Value) -> Self {
        Self { input: num(v, "input_tokens"), output: num(v, "output_tokens"), cached: num(v, "cached_input_tokens"), reasoning: num(v, "reasoning_output_tokens") }
    }
    fn add(&mut self, rhs: &Self) {
        self.input = self.input.saturating_add(rhs.input); self.output = self.output.saturating_add(rhs.output);
        self.cached = self.cached.saturating_add(rhs.cached); self.reasoning = self.reasoning.saturating_add(rhs.reasoning);
    }
    fn delta(&self, before: &Self) -> Self {
        Self { input: self.input.saturating_sub(before.input), output: self.output.saturating_sub(before.output), cached: self.cached.saturating_sub(before.cached), reasoning: self.reasoning.saturating_sub(before.reasoning) }
    }
}
fn num(v: &Value, k: &str) -> u64 { v[k].as_u64().unwrap_or(0) }
fn string(v: &Value, k: &str) -> String { v[k].as_str().unwrap_or("").to_string() }

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String, pub source: String, pub kind: String, pub model: String,
    pub tokens: Tokens, pub cost: Option<f64>, pub at: String, pub requests: u64,
    pub interrupted: bool,
    #[serde(default)] pub usage_unavailable: bool,
    #[serde(skip)] pub session: String,
    #[serde(skip)] pub started: String,
    #[serde(skip)] pub response_ids: HashSet<String>,
}

#[derive(Default)]
struct CodexFile {
    offset: u64, initialized: bool, model: String, turn: String,
    counter: Option<Tokens>, legacy: Tokens, records: Tokens,
    seen: HashSet<String>, has_records: bool, active: bool,
    completed: HashSet<String>, session: String,
    aliases: HashSet<String>, turn_snapshot: Option<Tokens>,
    started: String, subagent: bool,
}
impl CodexFile {
    fn parse(&mut self, v: &Value, boot: DateTime<Utc>) -> Option<Notice> {
        let p = &v["payload"];
        let kind = v["type"].as_str().unwrap_or("");
        let event = p["type"].as_str().unwrap_or("");
        if kind == "session_meta" { self.session = string(p, "id"); self.subagent = p["source"].get("subagent").is_some(); }
        if matches!(kind, "session_meta" | "token_usage_record") {
            for key in ["id", "session_id", "thread_id"] {
                if let Some(id) = p[key].as_str().filter(|s| !s.is_empty()) { self.aliases.insert(id.into()); }
            }
        }
        if kind == "turn_context" {
            if let Some(model) = p["model"].as_str() { self.model = model.into(); }
            if !p["turn_id"].is_null() { self.turn = string(p, "turn_id"); }
        }
        if kind == "event_msg" && event == "task_started" {
            self.turn = string(p, "turn_id"); self.active = true; self.started = string(v, "timestamp");
            self.legacy = Tokens::default(); self.records = Tokens::default(); self.has_records = false;
            self.turn_snapshot = None; self.seen.clear();
        }
        if kind == "token_usage_record" {
            if p["turn_token_usage"].is_object() && (self.turn.is_empty() || p["turn_id"].as_str() == Some(self.turn.as_str())) {
                self.turn_snapshot = Some(Tokens::from_codex(&p["turn_token_usage"]));
            }
            let id = string(p, "response_id");
            // Modern rollouts contain both usage records and legacy snapshots.
            // Prefer identified records per turn; never add both representations.
            if !id.is_empty() && self.seen.insert(id) {
                self.records.add(&Tokens::from_codex(&p["usage"])); self.has_records = true;
            }
        }
        if kind == "event_msg" && event == "token_count" && p["info"].is_object() {
            let total = Tokens::from_codex(&p["info"]["total_token_usage"]);
            let delta = if let Some(previous) = &self.counter {
                if total.input < previous.input || total.output < previous.output {
                    Tokens::from_codex(&p["info"]["last_token_usage"])
                } else { total.delta(previous) }
            } else { Tokens::from_codex(&p["info"]["last_token_usage"]) };
            self.legacy.add(&delta); self.counter = Some(total);
        }
        if kind != "event_msg" || !matches!(event, "task_complete" | "turn_aborted") { return None; }
        let turn = p["turn_id"].as_str().filter(|s| !s.is_empty()).unwrap_or(&self.turn).to_string();
        let at = string(v, "timestamp");
        let id = format!("{}:{turn}:{at}", self.session);
        let key = if turn.is_empty() { id.clone() } else { format!("{}:{turn}", self.session) };
        if !self.completed.insert(key) { return None; }
        let tokens = self.turn_snapshot.take().unwrap_or_else(|| if self.has_records { self.records.clone() } else { self.legacy.clone() });
        self.active = false; self.records = Tokens::default(); self.legacy = Tokens::default(); self.has_records = false;
        if DateTime::parse_from_rfc3339(&at).map(|t| t.with_timezone(&Utc) < boot).unwrap_or(true) { return None; }
        if tokens.total() == 0 || self.subagent { return None; }
        Some(Notice { usage_unavailable:false, id, source: "Codex".into(), kind: "turn".into(), model: self.model.clone(), tokens, cost: None, at, requests: 0, interrupted: event == "turn_aborted" || !p["error"].is_null(), session:self.session.clone(), started:self.started.clone(), response_ids:self.seen.clone() })
    }
    fn read(&mut self, path: &Path, boot: DateTime<Utc>) -> std::io::Result<Vec<Notice>> {
        let mut file = File::open(path)?;
        let size = file.metadata()?.len();
        if size < self.offset { *self = Self::default(); }
        if !self.initialized {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                if stem.len() >= 36 { self.session = stem[stem.len()-36..].to_string(); }
            }
            // Hydrate counters/turn context without replaying old completion notices.
            self.offset = size.saturating_sub(8 * 1024 * 1024);
            self.initialized = true;
            if self.offset > 0 {
                file.seek(SeekFrom::Start(self.offset))?;
                let mut reader = BufReader::new(&mut file); let mut skip = Vec::new();
                self.offset += reader.read_until(b'\n', &mut skip)? as u64;
            }
        }
        file.seek(SeekFrom::Start(self.offset))?;
        let mut reader = BufReader::new(file.take(32 * 1024 * 1024));
        let mut line = Vec::new(); let mut notices = Vec::new();
        loop {
            line.clear(); let n = reader.read_until(b'\n', &mut line)?;
            if n == 0 || line.last() != Some(&b'\n') { break; } // Retry partial writes next poll.
            self.offset += n as u64;
            let text = String::from_utf8_lossy(&line);
            if !["token_usage_record", "token_count", "task_started", "task_complete", "turn_aborted", "turn_context", "session_meta"].iter().any(|s| text.contains(s)) { continue; }
            if let Ok(value) = serde_json::from_slice::<Value>(&line) {
                if let Some(notice) = self.parse(&value, boot) { notices.push(notice); }
            }
        }
        Ok(notices)
    }
}

struct Monitor {
    sources: sources::Sources,
    magpie_ready: bool, port: u16, codex_enabled: bool,
    files: HashMap<PathBuf, CodexFile>,
    history: VecDeque<Notice>, codex_boot: DateTime<Utc>, last_scan: std::time::Instant,
}
impl Default for Monitor {
    fn default() -> Self {
        Self { sources: sources::Sources::default(), magpie_ready: false, port: 0, codex_enabled: false, files: HashMap::new(), history: VecDeque::new(), codex_boot: Utc::now(), last_scan: std::time::Instant::now() - Duration::from_secs(60) }
    }
}
fn codex_home() -> PathBuf {
    std::env::var_os("CODEX_HOME").map(PathBuf::from).filter(|p| p.is_dir())
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".codex"))
}
fn discover(dir: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > 5 { return; }
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue; };
        if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) { continue; }
        if meta.is_dir() { discover(&entry.path(), out, depth + 1); }
        else if entry.file_name().to_string_lossy().starts_with("rollout-") && entry.path().extension().and_then(|s| s.to_str()) == Some("jsonl")
            && meta.modified().ok().and_then(|t| t.elapsed().ok()).map(|d| d.as_secs() < 172800).unwrap_or(false) {
            out.push(entry.path());
        }
    }
}
fn magpie_notice(row: &Value) -> Notice {
    let at = string(row, "t");
    let id = format!("magpie:{}:{}:{}:{}", at, string(row, "response_id"), row["route_id"], string(row, "session"));
    // Magpie's input excludes cache reads/writes, unlike Codex's inclusive input.
    let tokens = Tokens { input: num(row, "in") + num(row, "cache_read") + num(row, "cache_write"), output: num(row, "out"), cached: num(row, "cache_read"), reasoning: num(row, "reasoning") };
    Notice { usage_unavailable:false, id, source: "Magpie".into(), kind: "request".into(), model: string(row, "model"), tokens,
        cost: if row["priced"].as_bool() == Some(true) { row["cost"].as_f64() } else { None }, at, requests: 1,
        interrupted: row["status"].as_u64().map(|s| s >= 400).unwrap_or(false), session:String::new(), started:String::new(), response_ids:HashSet::new() }
}
fn attach_magpie_cost(notice: &mut Notice, rows: &[Value]) {
    let mut matched = HashSet::new();
    let mut cost = 0.0;
    let mut priced = true;
    let mut tokens = Tokens::default();
    for row in rows {
        let response = string(row, "response_id");
        let row_time = DateTime::parse_from_rfc3339(&string(row, "t")).ok();
        let in_turn = !notice.session.is_empty()
            && (string(row, "native_session") == notice.session || string(row, "session") == notice.session)
            && row_time.is_some_and(|t| DateTime::parse_from_rfc3339(&notice.started).ok().is_some_and(|start| t >= start)
                && DateTime::parse_from_rfc3339(&notice.at).ok().is_some_and(|end| t <= end));
        if !notice.response_ids.contains(&response) && !in_turn { continue; }
        let n = magpie_notice(row);
        if !matched.insert(n.id) { continue; }
        tokens.add(&n.tokens);
        match n.cost { Some(v) if v.is_finite() && v >= 0.0 => cost += v, _ => priced = false }
    }
    notice.requests = matched.len() as u64;
    // A limited gateway page may omit early calls. Never label partial pricing as a whole-turn fee.
    if priced && !matched.is_empty() && tokens.total() == notice.tokens.total() { notice.cost = Some(cost); }
}
static MONITOR: OnceLock<Mutex<Monitor>> = OnceLock::new();
fn monitor() -> &'static Mutex<Monitor> { MONITOR.get_or_init(|| Mutex::new(Monitor::default())) }

// Opt-in local QA trail: counters and presentation geometry only, never conversation text.
fn audit(value: Value) {
    use std::io::Write;
    if std::env::var("WHALE_USAGE_AUDIT").as_deref() != Ok("1") { return; }
    static LOCK: Mutex<()> = Mutex::new(());
    let Ok(_guard) = LOCK.lock() else { return; };
    let path = app_data_dir().join("usage-audit.jsonl");
    if fs::metadata(&path).map(|m| m.len() > 1024*1024).unwrap_or(false) {
        let _ = fs::rename(&path, path.with_extension("previous.jsonl"));
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", json!({"at":Utc::now().to_rfc3339(),"data":value}));
    }
}
#[tauri::command]
pub fn record_usage_display(id: String, manual: bool, placement: String, previous_bubble: bool, bubble: [f64;4], toast: Option<[f64;4]>) {
    if id.len()>256 || !matches!(placement.as_str(), "inside"|"above") { return; }
    audit(json!({"stage":"display","id":id,"manual":manual,"placement":placement,"previousBubble":previous_bubble,"bubble":bubble,"toast":toast}));
}

#[tauri::command]
pub fn get_companion_history() -> Result<Value, String> {
    let m = monitor().lock().map_err(|_| "用量读取暂不可用")?;
    Ok(json!({"history":m.history,"codexFiles":m.files.len()}))
}

#[tauri::command]
pub async fn poll_companion(app: tauri::AppHandle) -> Result<Value, String> {
    let settings = get_companion_settings();
    // Establish startup boundary before the first HTTP request can finish.
    let _ = monitor();
    let magpie = magpie_get(settings.port, "/v1/magpie/usage/requests?period=7d&limit=500&via=through").await;
    let result = tauri::async_runtime::spawn_blocking(move || poll_local(settings, magpie)).await.map_err(|e| e.to_string())??;
    let _ = app.emit_to("config", "companion-status", &result);
    Ok(result)
}
fn poll_local(settings: Settings, magpie: Result<Value, String>) -> Result<Value, String> {
    let mut m = monitor().lock().map_err(|_| "用量读取暂不可用")?;
    if m.port != settings.port { m.port = settings.port; m.magpie_ready = false; }
    if m.codex_enabled != settings.codex_enabled {
        m.codex_enabled = settings.codex_enabled; m.files.clear(); m.codex_boot = Utc::now();
        m.last_scan = std::time::Instant::now() - Duration::from_secs(60);
    }
    let mut events = Vec::new(); let mut codex_error = None;
    let codex_available = settings.codex_enabled && codex_home().join("sessions").is_dir();
    if settings.codex_enabled && !codex_available { codex_error = Some("未找到 Codex 本机会话目录".to_string()); }
    if codex_available {
        if m.last_scan.elapsed() >= Duration::from_secs(10) {
            let mut paths = Vec::new(); discover(&codex_home().join("sessions"), &mut paths, 0);
            discover(&codex_home().join("archived_sessions"), &mut paths, 0);
            for path in paths { m.files.entry(path).or_default(); }
            m.last_scan = std::time::Instant::now();
        }
        let boot = m.codex_boot;
        for (path, file) in &mut m.files {
            match file.read(path, boot) { Ok(mut items) => events.append(&mut items), Err(_) => { codex_error = Some("部分 Codex 日志暂不可读，将自动重试".into()); } }
        }
    }
    let (mut other_events, source_status) = m.sources.poll(&settings);
    events.append(&mut other_events);
    let mut magpie_error = None;
    match magpie {
        Ok(data) => {
            if let Some(rows) = data["rows"].as_array() {
                // Gateway rows are accounting data, never turn-completion events.
                // Only a native task_complete/turn_aborted creates a notification.
                for notice in &mut events { if notice.source == "Codex" { attach_magpie_cost(notice, rows); } }
                m.magpie_ready = true;

            } else { magpie_error = Some("Magpie 用量接口缺少 rows 字段".to_string()); }
        },
        Err(e) => magpie_error = Some(e),
    }
    events.sort_by_key(|e| e.at.clone());
    events.retain(|e| !m.history.iter().any(|h| h.id == e.id));
    for event in &events { audit(json!({"stage":"complete","notice":event})); m.history.push_front(event.clone()); }
    while m.history.len() > 30 { m.history.pop_back(); }
    Ok(json!({ "events": if settings.notifications { events } else { vec![] }, "history": m.history,
        "magpieError": magpie_error, "codexError": codex_error, "codexFiles": m.files.len(), "sourceStatus":source_status, "settings": settings }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_settings_keep_account_and_gain_safe_font_defaults() {
        let s: Settings=serde_json::from_value(json!({"accountId":"saved-account","port":1234})).unwrap();
        assert_eq!(s.account_id,"saved-account");assert_eq!(s.port,1234);
        assert_eq!(s.font_family,"Microsoft YaHei UI");assert_eq!(s.font_scale,1.0);
        assert!(s.codex_enabled);assert_eq!(s.notification_placement,"inside");
        assert!(!s.rice_on_completion);
        assert!(s.character_dialogue);
        assert!(s.character_sounds.is_empty());assert!(s.character_sound_enabled.is_empty());
        let custom: Settings=serde_json::from_value(json!({"characterDialogue":false,"accountId":"keep"})).unwrap();
        assert!(!custom.character_dialogue);assert_eq!(custom.account_id,"keep");
        let enabled: Settings=serde_json::from_value(json!({"riceOnCompletion":true})).unwrap();
        assert!(enabled.rice_on_completion);
    }
    fn event(kind: &str, p: Value) -> Value { json!({"timestamp":"2026-10-17T12:00:00Z", "type": kind, "payload":p}) }
    fn boot() -> DateTime<Utc> { "2026-10-17T11:00:00Z".parse().unwrap() }
    #[test]
    fn records_and_legacy_are_not_counted_twice() {
        let mut f = CodexFile::default();
        f.parse(&event("event_msg", json!({"type":"task_started","turn_id":"t1"})), boot());
        let usage = json!({"input_tokens":100,"cached_input_tokens":30,"output_tokens":20,"reasoning_output_tokens":10});
        let record = event("token_usage_record", json!({"response_id":"r1","usage":usage}));
        f.parse(&record, boot()); f.parse(&record, boot());
        f.parse(&event("event_msg",json!({"type":"token_count","info":{"total_token_usage":usage,"last_token_usage":usage}})),boot());
        let end=event("event_msg",json!({"type":"task_complete","turn_id":"t1"}));
        let n=f.parse(&end,boot()).unwrap(); assert_eq!(n.tokens.total(),120); assert_eq!(n.tokens.cached,30);
        assert!(f.parse(&end,boot()).is_none());
    }
    #[test]
    fn cumulative_legacy_is_a_delta_and_old_events_are_silent() {
        let mut f=CodexFile::default(); f.counter=Some(Tokens{input:200,output:50,..Default::default()});
        let count=event("event_msg",json!({"type":"token_count","info":{"total_token_usage":{"input_tokens":300,"output_tokens":70}}}));
        f.parse(&count,boot()); f.parse(&count,boot());
        let end=event("event_msg",json!({"type":"task_complete","turn_id":"t1"}));
        assert_eq!(f.parse(&end,boot()).unwrap().tokens.total(),120);
        let mut f=CodexFile::default(); f.parse(&count,boot());
        assert!(f.parse(&end,"2026-10-18T00:00:00Z".parse().unwrap()).is_none());
    }
    #[test]
    fn magpie_cache_and_reasoning_have_distinct_semantics() {
        let n=magpie_notice(&json!({"in":100,"cache_read":500,"cache_write":20,"out":30,"reasoning":10,"cost":0,"priced":false}));
        assert_eq!(n.tokens.total(),650); assert_eq!(n.cost,None);
    }
    #[test]
    fn turn_snapshot_keeps_usage_before_tail_and_reports_failure() {
        let mut f = CodexFile::default();
        f.parse(&event("event_msg",json!({"type":"task_started","turn_id":"t2"})),boot());
        f.parse(&event("token_usage_record",json!({"turn_id":"t2","response_id":"r2","usage":{"input_tokens":20,"output_tokens":3},"turn_token_usage":{"input_tokens":2000,"output_tokens":30}})),boot());
        let n=f.parse(&event("event_msg",json!({"type":"task_complete","turn_id":"t2","error":"failed"})),boot()).unwrap();
        assert_eq!(n.tokens.total(),2030);assert!(n.interrupted);
    }
    #[test]
    fn partial_jsonl_is_retried() {
        let path=std::env::temp_dir().join(format!("whale-partial-{}.jsonl",std::process::id()));
        fs::write(&path,b"{\"type\":\"turn_context\",\"payload\":{\"model\":\"test\"}}").unwrap();
        let mut f=CodexFile::default(); f.read(&path,boot()).unwrap(); assert_eq!(f.offset,0);
        use std::io::Write;
        std::fs::OpenOptions::new().append(true).open(&path).unwrap().write_all(b"\n").unwrap();
        f.read(&path,boot()).unwrap(); assert_eq!(f.model,"test"); assert!(f.offset>0);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn many_requests_only_notify_after_the_native_turn_finishes() {
        let mut f = CodexFile::default();
        f.parse(&event("event_msg",json!({"type":"task_started","turn_id":"whole"})),boot());
        for i in 0..8 {
            assert!(f.parse(&event("token_usage_record",json!({"response_id":format!("r{i}"),"usage":{"input_tokens":100,"output_tokens":20}})),boot()).is_none());
        }
        let done=event("event_msg",json!({"type":"task_complete","turn_id":"whole"}));
        let n=f.parse(&done,boot()).unwrap();
        assert_eq!(n.tokens.total(),960);
        assert!(f.parse(&done,boot()).is_none());
    }
    #[test]
    fn gateway_requests_never_create_completion_notifications() {
        let settings=Settings{codex_enabled:false,..Default::default()};
        let r=poll_local(settings,Ok(json!({"rows":[{"t":Utc::now().to_rfc3339(),"in":100,"out":20,"response_id":"only-http"}]}))).unwrap();
        assert_eq!(r["events"],json!([]));
        assert_eq!(r["history"],json!([]));
    }
    #[test]
    fn partial_gateway_pricing_is_not_a_whole_turn_fee() {
        let mut n=magpie_notice(&json!({}));
        n.tokens=Tokens{input:200,output:40,..Default::default()};
        n.response_ids=HashSet::from(["r1".into(),"r2".into()]);
        let a=json!({"response_id":"r1","in":100,"out":20,"priced":true,"cost":0.01});
        attach_magpie_cost(&mut n,&[a.clone()]);assert_eq!(n.cost,None);
        let b=json!({"response_id":"r2","in":100,"out":20,"priced":true,"cost":0.02});
        attach_magpie_cost(&mut n,&[a.clone(),a,b]);assert_eq!(n.requests,2);assert_eq!(n.cost,Some(0.03));
    }
    #[test]
    fn subagent_completion_does_not_interrupt_the_parent_turn() {
        let mut f=CodexFile::default();
        f.parse(&event("session_meta",json!({"id":"child","source":{"subagent":{}}})),boot());
        f.parse(&event("token_usage_record",json!({"response_id":"r","usage":{"input_tokens":100}})),boot());
        assert!(f.parse(&event("event_msg",json!({"type":"task_complete","turn_id":"child-turn"})),boot()).is_none());
    }
}
