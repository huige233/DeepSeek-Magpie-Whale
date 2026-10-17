//! Local metadata adapters. Never execute provider scripts or read credentials.
use super::{num, string, Notice, Settings, Tokens};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const KEYS: [&str; 5] = ["claude", "ccswitch", "opencode", "cursor", "trae"];
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SourceSettings {
    pub enabled: bool,
    pub path: String,
    pub mode: String,
    pub interval_seconds: u64,
}
impl Default for SourceSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            path: String::new(),
            mode: "turn".into(),
            interval_seconds: 5,
        }
    }
}
pub fn validate_settings(s: &mut Settings) -> Result<(), String> {
    s.usage_sources.retain(|k, _| KEYS.contains(&k.as_str()));
    for (key, v) in &mut s.usage_sources {
        v.interval_seconds = v.interval_seconds.clamp(2, 300);
        v.path = v.path.trim().to_string();
        if !v.path.is_empty() && !Path::new(&v.path).is_absolute() {
            return Err("请输入本地绝对路径，或留空自动定位".into());
        }
        if v.path.len() > 2048 || v.path.chars().any(char::is_control) {
            return Err("读取路径无效".into());
        }
        if v.mode != "stage" {
            v.mode = "turn".into();
        }
        if key == "ccswitch" {
            v.mode = "stage".into();
        }
        if matches!(key.as_str(), "cursor" | "trae") {
            v.mode = "turn".into();
        }
    }
    s.character_lines
        .retain(|group, _| crate::character::valid_group(group));
    for cues in s.character_lines.values_mut() {
        cues.retain(|cue, _| {
            [
                "idle",
                "pat",
                "shy",
                "angry",
                "warn",
                "lonely",
                "return",
                "feed",
                "fed",
                "exhausted",
            ]
            .contains(&cue.as_str())
        });
        for lines in cues.values_mut() {
            if lines.len() > 100 || lines.iter().any(|s| s.chars().count() > 300) {
                return Err("每个场景最多 100 条台词，每条最多 300 字".into());
            }
            *lines = lines
                .iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
        // Empty lists restore defaults rather than disabling all interaction feedback.
        cues.retain(|_, v| !v.is_empty());
    }
    Ok(())
}
fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}
fn default_path(key: &str) -> PathBuf {
    match key {
        "claude" => std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home().join(".claude"))
            .join("projects"),
        "ccswitch" => home().join(".cc-switch/cc-switch.db"),
        "opencode" => std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home().join(".local/share"))
            .join("opencode/opencode.db"),
        _ => crate::infrastructure::system::paths::app_data_dir()
            .join("usage-events")
            .join(key),
    }
}
fn fresh(at: &str, boot: DateTime<Utc>) -> bool {
    DateTime::parse_from_rfc3339(at).is_ok_and(|t| t.with_timezone(&Utc) >= boot)
}
fn millis(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms)
        .map(|t| t.to_rfc3339())
        .unwrap_or_default()
}
fn notice(source: &str, id: String, kind: &str, at: String, tokens: Tokens) -> Notice {
    Notice {
        id: format!("{source}:{id}"),
        source: source.into(),
        kind: kind.into(),
        at,
        tokens,
        model: String::new(),
        cost: None,
        requests: 0,
        interrupted: false,
        usage_unavailable: false,
        session: String::new(),
        started: String::new(),
        response_ids: HashSet::new(),
    }
}
fn claude_tokens(v: &Value) -> Tokens {
    Tokens {
        input: num(v, "input_tokens")
            .saturating_add(num(v, "cache_read_input_tokens"))
            .saturating_add(num(v, "cache_creation_input_tokens")),
        output: num(v, "output_tokens"),
        cached: num(v, "cache_read_input_tokens"),
        reasoning: num(v, "reasoning_output_tokens"),
    }
}
fn opencode_tokens(v: &Value) -> Tokens {
    Tokens {
        input: num(v, "input")
            .saturating_add(num(&v["cache"], "read"))
            .saturating_add(num(&v["cache"], "write")),
        output: num(v, "output").saturating_add(num(v, "reasoning")),
        cached: num(&v["cache"], "read"),
        reasoning: num(v, "reasoning"),
    }
}
#[derive(Clone, Default)]
struct ClaudeFile {
    offset: u64,
    turn: String,
    model: String,
    session: String,
    messages: HashMap<String, Tokens>,
    stages: HashSet<String>,
}
impl ClaudeFile {
    fn parse(&mut self, v: &Value, boot: DateTime<Utc>, stage: bool) -> Option<Notice> {
        if v["isSidechain"].as_bool() == Some(true) {
            return None;
        }
        if let Some(id) = v["sessionId"].as_str() {
            self.session = id.into();
        }
        if v["type"] == "user" {
            let content = &v["message"]["content"];
            let tool_result = content
                .as_array()
                .is_some_and(|a| a.iter().any(|x| x["type"] == "tool_result"));
            if !tool_result && v["isMeta"] != true {
                self.turn = string(v, "uuid");
                self.messages.clear();
                self.stages.clear();
            }
        }
        let at = string(v, "timestamp");
        if v["type"] == "assistant" {
            let m = &v["message"];
            let id = string(m, "id");
            if id.is_empty() || !m["usage"].is_object() {
                return None;
            }
            let tokens = claude_tokens(&m["usage"]);
            // Streaming snapshots repeat message IDs. Replace, never sum snapshots.
            let previous = self.messages.entry(id.clone()).or_default();
            previous.input = previous.input.max(tokens.input);
            previous.output = previous.output.max(tokens.output);
            previous.cached = previous.cached.max(tokens.cached);
            previous.reasoning = previous.reasoning.max(tokens.reasoning);
            self.model = string(m, "model");
            if stage
                && m["stop_reason"].is_string()
                && self.stages.insert(id.clone())
                && fresh(&at, boot)
            {
                let mut n = notice(
                    "Claude Code",
                    format!("{}:{id}", self.session),
                    "stage",
                    at,
                    previous.clone(),
                );
                n.model = self.model.clone();
                return Some(n);
            }
        }
        // end_turn on a model response is insufficient: hooks can continue the agent.
        if v["type"] == "system" && v["subtype"] == "turn_duration" && !self.turn.is_empty() {
            let mut total = Tokens::default();
            for t in self.messages.values() {
                total.add(t);
            }
            let turn = std::mem::take(&mut self.turn);
            let count = self.messages.len();
            self.messages.clear();
            if !stage && fresh(&at, boot) && total.total() > 0 {
                let mut n = notice(
                    "Claude Code",
                    format!("{}:{turn}", self.session),
                    "turn",
                    at,
                    total,
                );
                n.model = self.model.clone();
                n.requests = count as u64;
                return Some(n);
            }
        }
        None
    }
    fn read(
        &mut self,
        path: &Path,
        boot: DateTime<Utc>,
        stage: bool,
    ) -> Result<Vec<Notice>, String> {
        let mut f = fs::File::open(path).map_err(|_| "会话暂不可读")?;
        let size = f.metadata().map_err(|_| "无法读取会话大小")?.len();
        if size < self.offset {
            *self = Self::default();
        }
        // Do not silently count a partial turn from a truncated tail.
        if size - self.offset > 128 * 1024 * 1024 {
            return Err("单个会话未读数据超过 128 MiB，暂停该文件以避免少算".into());
        }
        f.seek(SeekFrom::Start(self.offset))
            .map_err(|_| "无法定位会话")?;
        let mut reader = BufReader::new(f);
        let mut line = Vec::new();
        let mut out = Vec::new();
        loop {
            line.clear();
            let n = reader
                .read_until(b'\n', &mut line)
                .map_err(|_| "会话读取失败")?;
            if n == 0 || line.last() != Some(&b'\n') {
                break;
            }
            self.offset += n as u64;
            if let Ok(v) = serde_json::from_slice(&line) {
                if let Some(n) = self.parse(&v, boot, stage) {
                    out.push(n);
                }
            }
        }
        Ok(out)
    }
}
fn discover(dir: &Path, out: &mut Vec<PathBuf>, depth: u8) -> Result<(), String> {
    if depth > 2 {
        return Ok(());
    }
    for e in fs::read_dir(dir).map_err(|_| "日志目录不可读")?.flatten() {
        let ty = e.file_type().map_err(|_| "日志目录不可读")?;
        if ty.is_symlink() {
            continue;
        }
        if ty.is_dir() && e.file_name() != "subagents" {
            discover(&e.path(), out, depth + 1)?;
        } else if ty.is_file()
            && e.path().extension().is_some_and(|s| s == "jsonl")
            && !e.file_name().to_string_lossy().starts_with("agent-")
        {
            out.push(e.path());
        }
    }
    Ok(())
}
fn read_db(path: &Path) -> Result<Connection, String> {
    let c = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "数据库不存在或不可读；请指定正确的 .db 文件")?;
    c.busy_timeout(Duration::from_millis(250))
        .map_err(|_| "数据库忙")?;
    c.execute_batch("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;")
        .map_err(|_| "无法开启只读查询")?;
    Ok(c)
}
fn table_exists(c: &Connection, name: &str) -> bool {
    c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [name],
        |r| r.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

fn cc_rows(
    c: &Connection,
    boot: DateTime<Utc>,
    settings: &Settings,
) -> Result<Vec<Notice>, String> {
    let mut columns = c
        .prepare("PRAGMA table_info(proxy_request_logs)")
        .map_err(|_| "CC Switch 表结构不可读")?;
    let cols = columns
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|_| "CC Switch 表结构不可读")?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|_| "CC Switch 表结构不可读")?;
    let semantics = if cols.contains("input_token_semantics") {
        "input_token_semantics"
    } else {
        "0"
    };
    let pricing = if cols.contains("pricing_model") {
        "pricing_model"
    } else {
        "NULL"
    };
    let sql=format!("SELECT request_id,app_type,model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,CAST(total_cost_usd AS REAL),status_code,created_at,{semantics},{pricing} FROM proxy_request_logs WHERE created_at>=?1 AND COALESCE(data_source,'proxy')='proxy' ORDER BY created_at,request_id LIMIT 10001");
    let mut stmt = c
        .prepare(&sql)
        .map_err(|_| "CC Switch 版本或表结构不兼容")?;
    let rows = stmt
        .query_map([boot.timestamp()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, u64>(3)?,
                r.get::<_, u64>(4)?,
                r.get::<_, u64>(5)?,
                r.get::<_, u64>(6)?,
                r.get::<_, Option<f64>>(7)?,
                r.get::<_, u16>(8)?,
                r.get::<_, i64>(9)?,
                r.get::<_, i64>(10)?,
                r.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(|_| "CC Switch 查询失败")?;
    let mut out = Vec::new();
    let mut count = 0;
    for row in rows {
        count += 1;
        if count > 10000 {
            return Err("本次运行请求超过 10000 条，请重启监听；未截断统计".into());
        }
        let (id, app, model, input, output, read, write, cost, status, at, sem, pricing) =
            row.map_err(|_| "CC Switch 用量行无法解析")?;
        // Native adapters own these applications when selected; never double notify.
        if (app == "codex" && settings.codex_enabled)
            || settings
                .usage_sources
                .get(app.as_str())
                .is_some_and(|v| v.enabled)
        {
            continue;
        }
        let inclusive = matches!(app.as_str(), "codex" | "gemini" | "grokbuild");
        let input = if sem == 2 || !inclusive {
            input.saturating_add(read).saturating_add(write)
        } else if sem == 0 {
            input.saturating_add(write)
        } else {
            input
        };
        let mut n = notice(
            &format!("CC Switch / {app}"),
            id,
            "stage",
            millis(at * 1000),
            Tokens {
                input,
                output,
                cached: read,
                reasoning: 0,
            },
        );
        n.model = model;
        n.requests = 1;
        n.interrupted = status >= 400;
        n.cost = cost.filter(|v| {
            v.is_finite()
                && *v >= 0.0
                && (*v > 0.0 || pricing.as_ref().is_some_and(|s| !s.is_empty()))
        });
        out.push(n);
    }
    Ok(out)
}

fn opencode_rows(c: &Connection, boot: DateTime<Utc>, stage: bool) -> Result<Vec<Notice>, String> {
    let v2 = table_exists(c, "session_v2") && table_exists(c, "session_message");
    let (sessions, messages, kind) = if v2 {
        ("session_v2", "session_message", "m.type")
    } else {
        ("session", "message", "json_extract(m.data,'$.role')")
    };
    // Select recent sessions, then hydrate ALL metadata in each selected session.
    let sql=format!("SELECT m.id,m.session_id,m.data,{kind},m.time_created FROM {messages} m JOIN {sessions} s ON m.session_id=s.id WHERE s.parent_id IS NULL AND (s.time_updated>=?1 OR EXISTS(SELECT 1 FROM {messages} x WHERE x.session_id=s.id AND x.time_updated>=?1)) ORDER BY m.session_id,m.time_created,m.id LIMIT 50001");
    let mut stmt = c
        .prepare(&sql)
        .map_err(|_| "OpenCode 数据库结构不兼容（支持 V1/V2）")?;
    let rows = stmt
        .query_map([boot.timestamp_millis()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })
        .map_err(|_| "OpenCode 查询失败")?;
    let mut out = Vec::new();
    let mut active_session = String::new();
    let mut total = Tokens::default();
    let mut cost = Some(0.0);
    let mut model = String::new();
    let mut requests = 0;
    let mut count = 0;
    let mut turn = String::new();
    for row in rows {
        count += 1;
        if count > 50000 {
            return Err("活跃 OpenCode 会话过大，暂停读取以免少算".into());
        }
        let (id, session, data, kind, created) = row.map_err(|_| "OpenCode 用量行无法解析")?;
        let v: Value =
            serde_json::from_str(&data).map_err(|_| "OpenCode 消息元数据不完整，稍后重试")?;
        if active_session != session {
            active_session = session.clone();
            total = Tokens::default();
            cost = Some(0.0);
            requests = 0;
            turn.clear();
        }
        let kind = kind.unwrap_or_default();
        if kind == "user" && (!v2 || turn.is_empty()) {
            turn = id.clone();
            if !v2 {
                total = Tokens::default();
                cost = Some(0.0);
                requests = 0;
            }
        }
        let completed = v["time"]["completed"].as_i64().or_else(|| {
            if matches!(v["status"].as_str(), Some("completed" | "failed")) {
                Some(created)
            } else {
                None
            }
        });
        if matches!(kind.as_str(), "assistant" | "compaction")
            && completed.is_some()
            && v["tokens"].is_object()
        {
            let tokens = opencode_tokens(&v["tokens"]);
            total.add(&tokens);
            requests += 1;
            model = v["modelID"]
                .as_str()
                .or(v["model"]["id"].as_str())
                .unwrap_or("")
                .into();
            let price = v["cost"].as_f64().filter(|x| x.is_finite() && *x >= 0.0);
            cost = cost.zip(price).map(|(a, b)| a + b);
            let at = millis(completed.unwrap());
            if stage && fresh(&at, boot) {
                let mut n = notice("OpenCode", format!("{session}:{id}"), "stage", at, tokens);
                n.cost = price;
                n.model = model.clone();
                n.interrupted = v["error"].is_object();
                n.requests = 1;
                out.push(n);
            }
        }
        let terminal = if v2 {
            kind == "idle"
        } else {
            kind == "assistant"
                && completed.is_some()
                && matches!(
                    v["finish"].as_str(),
                    Some("stop" | "length" | "content-filter" | "error")
                )
        };
        if terminal {
            let at = millis(if v2 {
                created
            } else {
                completed.unwrap_or(created)
            });
            if !stage && fresh(&at, boot) && total.total() > 0 && !turn.is_empty() {
                let mut n = notice(
                    "OpenCode",
                    format!("{session}:{id}"),
                    "turn",
                    at,
                    total.clone(),
                );
                n.cost = cost;
                n.model = model.clone();
                n.requests = requests;
                n.interrupted = if v2 {
                    v["outcome"] != "succeeded"
                } else {
                    v["error"].is_object() || v["finish"] != "stop"
                };
                out.push(n);
            }
            total = Tokens::default();
            cost = Some(0.0);
            requests = 0;
            turn.clear();
        }
    }
    Ok(out)
}

struct SourceState {
    primed: bool,
    native_sources: String,
    config: SourceSettings,
    boot: DateTime<Utc>,
    last: Instant,
    files: HashMap<PathBuf, ClaudeFile>,
    seen: HashSet<String>,
    status: String,
    bridge_turns: HashMap<String, String>,
}
impl SourceState {
    fn new(config: SourceSettings) -> Self {
        Self {
            primed: false,
            native_sources: String::new(),
            config,
            boot: Utc::now(),
            last: Instant::now() - Duration::from_secs(301),
            files: HashMap::new(),
            seen: HashSet::new(),
            status: String::new(),
            bridge_turns: HashMap::new(),
        }
    }
}
#[derive(Default)]
pub struct Sources {
    states: HashMap<String, SourceState>,
}
impl Sources {
    pub fn poll(&mut self, settings: &Settings) -> (Vec<Notice>, HashMap<String, String>) {
        let mut events = Vec::new();
        let mut statuses = HashMap::new();
        for key in KEYS {
            let config = settings.usage_sources.get(key).cloned().unwrap_or_default();
            let native_sources = if key == "ccswitch" {
                format!(
                    "{}:{}:{}",
                    settings.codex_enabled,
                    settings
                        .usage_sources
                        .get("claude")
                        .is_some_and(|s| s.enabled),
                    settings
                        .usage_sources
                        .get("opencode")
                        .is_some_and(|s| s.enabled)
                )
            } else {
                String::new()
            };
            if !config.enabled {
                self.states.remove(key);
                statuses.insert(key.into(), "已关闭".into());
                continue;
            }
            if self.states.get(key).map_or(true, |s| {
                s.config.path != config.path
                    || s.config.mode != config.mode
                    || s.native_sources != native_sources
            }) {
                self.states
                    .insert(key.into(), SourceState::new(config.clone()));
            }
            let s = self.states.get_mut(key).unwrap();
            s.config = config.clone();
            s.native_sources = native_sources;
            if s.last.elapsed() >= Duration::from_secs(config.interval_seconds.clamp(2, 300)) {
                s.last = Instant::now();
                let path = if config.path.is_empty() {
                    default_path(key)
                } else {
                    PathBuf::from(&config.path)
                };
                let mut warning = String::new();
                let result = match key {
                    "claude" => {
                        let mut paths = Vec::new();
                        let root = if path.join("projects").is_dir() {
                            path.join("projects")
                        } else {
                            path
                        };
                        discover(&root, &mut paths, 0).and_then(|()| {
                            let mut out = Vec::new();
                            for p in paths {
                                let current = s.files.entry(p.clone()).or_default();
                                let mut next = current.clone();
                                match next.read(&p, s.boot, config.mode == "stage") {
                                    Ok(items) => {
                                        out.extend(items);
                                        *current = next;
                                    }
                                    Err(e) => warning = e,
                                }
                            }
                            Ok(out)
                        })
                    }
                    "ccswitch" => read_db(&path).and_then(|c| cc_rows(&c, s.boot, settings)),
                    "opencode" => read_db(&path)
                        .and_then(|c| opencode_rows(&c, s.boot, config.mode == "stage")),
                    _ => read_bridge(&path, key, s),
                };
                match result {
                    Ok(items) => {
                        s.status = match key {
                            "claude" => format!(
                                "只读监听 {} 个文件；整轮需 turn_duration 标记",
                                s.files.len()
                            ),
                            "ccswitch" => {
                                "只读代理请求；已跳过原生已启用来源及镜像会话；仅阶段通知".into()
                            }
                            "opencode" => "只读数据库；原生结束标记聚合，子代理不单独弹窗".into(),
                            _ => "Hook 元数据读取中；未提供 Token 时明确显示未知（不估算）".into(),
                        };
                        for n in items {
                            if s.seen.insert(n.id.clone()) && (key != "ccswitch" || s.primed) {
                                events.push(n);
                            }
                        }
                        s.primed = true;
                    }
                    Err(e) => s.status = e,
                }
                if !warning.is_empty() {
                    s.status = format!("{}；部分文件：{warning}", s.status);
                }
            }
            statuses.insert(key.into(), s.status.clone());
        }
        (events, statuses)
    }
}

fn read_bridge(path: &Path, key: &str, s: &mut SourceState) -> Result<Vec<Notice>, String> {
    let entries =
        fs::read_dir(path).map_err(|_| "尚无 Hook 记录：请先导出接入配置并在 IDE 中合并启用")?;
    let mut paths: Vec<_> = entries
        .flatten()
        .filter(|e| {
            e.file_type().is_ok_and(|t| t.is_file())
                && e.path().extension().is_some_and(|e| e == "json")
        })
        .map(|e| e.path())
        .collect();
    paths.sort();
    let mut out = Vec::new();
    for p in paths {
        if fs::metadata(&p).map(|m| m.len() > 16384).unwrap_or(true) {
            continue;
        }
        let Ok(v) = fs::read(&p)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .ok_or(())
        else {
            continue;
        };
        let at = string(&v, "at");
        if !fresh(&at, s.boot) || v["source"] != key {
            continue;
        }
        let file_id = format!("file:{}", p.display());
        if !s.seen.insert(file_id) {
            continue;
        }
        let session = string(&v, "session");
        let generation = string(&v, "generation");
        if v["event"] == "start" {
            s.bridge_turns.insert(session, string(&v, "id"));
            continue;
        }
        if v["event"] != "stop" {
            continue;
        }
        let turn = if !generation.is_empty() {
            generation
        } else {
            let Some(t) = s.bridge_turns.get(&session) else {
                continue;
            };
            t.clone()
        };
        let known = v["tokens"].is_object();
        let tokens = serde_json::from_value(v["tokens"].clone()).unwrap_or_default();
        let mut n = notice(
            if key == "cursor" { "Cursor" } else { "Trae" },
            format!("{session}:{turn}"),
            "turn",
            at,
            tokens,
        );
        n.usage_unavailable = !known;
        n.interrupted = v["interrupted"] == true;
        n.model = string(&v, "model");
        out.push(n);
    }
    Ok(out)
}

/// Invoked by explicitly installed hooks, before Tauri/single-instance initialization.
pub fn capture_hook(key: &str, event: &str) -> Result<(), String> {
    if !matches!(key, "cursor" | "trae") || !matches!(event, "start" | "stop") {
        return Err("Unsupported hook".into());
    }
    let mut input = Vec::new();
    std::io::stdin()
        .take(1024 * 1024)
        .read_to_end(&mut input)
        .map_err(|_| "Hook input unavailable")?;
    let v: Value = serde_json::from_slice(&input).map_err(|_| "Invalid hook JSON")?;
    let meta = hook_metadata(key, event, &v)?;
    let dir = default_path(key);
    fs::create_dir_all(&dir).map_err(|_| "Cannot create metadata directory")?;
    let name = format!(
        "{}-{}.json",
        Utc::now().timestamp_nanos_opt().unwrap_or_default(),
        std::process::id()
    );
    let temp = dir.join(format!("{name}.tmp"));
    fs::write(&temp, serde_json::to_vec(&meta).unwrap())
        .map_err(|_| "Cannot write hook metadata")?;
    fs::rename(temp, dir.join(name)).map_err(|_| "Cannot commit hook metadata")?;
    Ok(())
}
fn hook_metadata(key: &str, event: &str, v: &Value) -> Result<Value, String> {
    let session = v["conversation_id"]
        .as_str()
        .or(v["session_id"].as_str())
        .filter(|s| !s.is_empty())
        .ok_or("Missing session ID")?;
    let generation = v["generation_id"].as_str().unwrap_or("");
    // Whitelist metadata: prompts, replies, paths, tool arguments and credentials never persist.
    let mut meta = json!({"id":format!("{}-{}",Utc::now().timestamp_nanos_opt().unwrap_or_default(),std::process::id()),"at":Utc::now().to_rfc3339(),"source":key,"event":event,"session":session.chars().take(200).collect::<String>(),"generation":generation.chars().take(200).collect::<String>(),"model":v["model"].as_str().unwrap_or("").chars().take(120).collect::<String>(),"interrupted":matches!(v["status"].as_str(),Some("aborted"|"error"))});
    // These optional fields are used only when the IDE explicitly supplies them.
    let u = &v["usage"];
    if u["input_tokens"].is_u64() && u["output_tokens"].is_u64() {
        meta["tokens"] = json!(claude_tokens(u));
    }
    Ok(meta)
}
#[tauri::command]
pub fn export_usage_hook(source: String) -> Result<String, String> {
    if !matches!(source.as_str(), "cursor" | "trae") {
        return Err("只支持 Cursor / Trae Hook 模板".into());
    }
    let exe = std::env::current_exe().map_err(|_| "无法确定程序位置")?;
    let command = |event: &str| format!("\"{}\" --usage-hook {source} {event}", exe.display());
    let value = if source == "cursor" {
        json!({"version":1,"hooks":{"beforeSubmitPrompt":[{"command":command("start")}],"stop":[{"command":command("stop")}]}})
    } else {
        json!({"version":1,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":command("start"),"timeout":5}]}],"Notification":[{"matcher":"idle_prompt","hooks":[{"type":"command","command":command("stop"),"timeout":5}]}]}})
    };
    let dir = crate::infrastructure::system::paths::app_data_dir().join("integrations");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{source}-hooks.example.json"));
    fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
#[path = "usage_sources_tests.rs"]
mod tests;
