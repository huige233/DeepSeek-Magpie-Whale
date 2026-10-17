use super::*;
fn boot() -> DateTime<Utc> {
    "2026-10-17T00:00:00Z".parse().unwrap()
}
fn at() -> String {
    "2026-10-17T01:00:00Z".into()
}
fn user(id: &str) -> Value {
    json!({"type":"user","uuid":id,"sessionId":"s","timestamp":at(),"message":{"content":"not stored"}})
}
fn assistant(id: &str, out: u64, stop: Value) -> Value {
    json!({"type":"assistant","sessionId":"s","timestamp":at(),"message":{"id":id,"model":"test","stop_reason":stop,"usage":{"input_tokens":10,"output_tokens":out,"cache_read_input_tokens":20,"cache_creation_input_tokens":5}}})
}
fn finish() -> Value {
    json!({"type":"system","subtype":"turn_duration","timestamp":at()})
}
#[test]
fn claude_full_turn_waits_for_terminal_and_deduplicates_streaming() {
    let mut f = ClaudeFile::default();
    f.parse(&user("u1"), boot(), false);
    assert!(f
        .parse(&assistant("a", 1, Value::Null), boot(), false)
        .is_none());
    assert!(f
        .parse(&assistant("a", 7, json!("tool_use")), boot(), false)
        .is_none());
    f.parse(
        &json!({"type":"user","uuid":"tool","message":{"content":[{"type":"tool_result"}]}}),
        boot(),
        false,
    );
    assert!(f
        .parse(&assistant("b", 9, json!("end_turn")), boot(), false)
        .is_none());
    let n = f.parse(&finish(), boot(), false).unwrap();
    assert_eq!(
        n.tokens,
        Tokens {
            input: 70,
            output: 16,
            cached: 40,
            reasoning: 0
        }
    );
    assert_eq!(n.requests, 2);
    assert!(f.parse(&finish(), boot(), false).is_none());
}
#[test]
fn claude_stage_is_not_turn_and_sidechains_old_records_are_silent() {
    let mut f = ClaudeFile::default();
    f.parse(&user("u"), boot(), true);
    let row = assistant("a", 7, json!("tool_use"));
    assert_eq!(f.parse(&row, boot(), true).unwrap().kind, "stage");
    assert!(f.parse(&row, boot(), true).is_none());
    assert!(f.parse(&finish(), boot(), true).is_none());
    let mut side = row.clone();
    side["isSidechain"] = json!(true);
    assert!(f.parse(&side, boot(), false).is_none());
    f.parse(&user("old"), boot(), false);
    f.parse(&row, boot(), false);
    assert!(f
        .parse(&finish(), "2026-10-18T00:00:00Z".parse().unwrap(), false)
        .is_none());
}
fn temp(name: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let p = std::env::temp_dir().join(format!(
        "whale-source-{}-{}-{name}",
        std::process::id(),
        N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    fs::create_dir_all(&p).unwrap();
    p
}
#[test]
fn claude_partial_json_line_retried_and_truncation_rehydrates() {
    use std::io::Write;
    let dir = temp("partial");
    let path = dir.join("s.jsonl");
    fs::write(
        &path,
        format!(
            "{}\n{}\n{}",
            user("u"),
            assistant("a", 3, json!("end_turn")),
            finish()
        ),
    )
    .unwrap();
    let mut f = ClaudeFile::default();
    assert!(f.read(&path, boot(), false).unwrap().is_empty());
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap()
        .write_all(b"\n")
        .unwrap();
    assert_eq!(f.read(&path, boot(), false).unwrap().len(), 1);
    assert!(f.read(&path, boot(), false).unwrap().is_empty());
    fs::write(&path, b"{}\n").unwrap();
    assert!(f.read(&path, boot(), false).unwrap().is_empty());
    assert_eq!(f.offset, 3);
    fs::remove_file(path).unwrap();
    fs::remove_dir(dir).unwrap();
}
fn cc_db() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    c.execute_batch("CREATE TABLE proxy_request_logs(request_id TEXT,app_type TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,cache_read_tokens INTEGER,cache_creation_tokens INTEGER,total_cost_usd TEXT,status_code INTEGER,created_at INTEGER,input_token_semantics INTEGER,pricing_model TEXT,data_source TEXT);").unwrap();
    c
}
fn cc_insert(c: &Connection, id: &str, app: &str, sem: i64, source: &str) {
    c.execute(
        "INSERT INTO proxy_request_logs VALUES(?1,?2,'model',100,20,30,5,'0',200,?3,?4,NULL,?5)",
        rusqlite::params![id, app, boot().timestamp() + 3600, sem, source],
    )
    .unwrap();
}
#[test]
fn cc_switch_cache_semantics_native_overlap_and_unknown_cost() {
    let c = cc_db();
    cc_insert(&c, "a", "codex", 1, "proxy");
    cc_insert(&c, "b", "claude", 2, "proxy");
    cc_insert(&c, "c", "codex", 0, "proxy");
    cc_insert(&c, "mirror", "claude", 2, "session_log");
    let mut s = Settings::default();
    let rows = cc_rows(&c, boot(), &s).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].tokens.input, 135);
    assert_eq!(rows[0].cost, None);
    assert_eq!(rows[0].kind, "stage");
    s.codex_enabled = false;
    let rows = cc_rows(&c, boot(), &s).unwrap();
    assert_eq!(
        rows.iter().map(|n| n.tokens.input).collect::<Vec<_>>(),
        vec![100, 135, 105]
    );
    s.usage_sources.insert(
        "claude".into(),
        SourceSettings {
            enabled: true,
            ..Default::default()
        },
    );
    assert_eq!(cc_rows(&c, boot(), &s).unwrap().len(), 2);
}
#[test]
fn sqlite_open_is_read_only_and_never_creates_missing_db() {
    let dir = temp("sqlite");
    let p = dir.join("test.db");
    assert!(read_db(&p).is_err());
    assert!(!p.exists());
    {
        let c = Connection::open(&p).unwrap();
        c.execute_batch("CREATE TABLE test(a);").unwrap();
    }
    let before = fs::read(&p).unwrap();
    {
        let c = read_db(&p).unwrap();
        assert!(c.execute("INSERT INTO test VALUES(1)", []).is_err());
    }
    assert_eq!(fs::read(&p).unwrap(), before);
    fs::remove_file(p).unwrap();
    fs::remove_dir(dir).unwrap();
}
fn oc_db(v2: bool) -> Connection {
    let c = Connection::open_in_memory().unwrap();
    let (s, m) = if v2 {
        ("session_v2", "session_message")
    } else {
        ("session", "message")
    };
    c.execute_batch(&format!("CREATE TABLE {s}(id TEXT,parent_id TEXT,time_updated INTEGER);CREATE TABLE {m}(id TEXT,session_id TEXT,data TEXT,type TEXT,time_created INTEGER,time_updated INTEGER);")).unwrap();
    c.execute(
        &format!("INSERT INTO {s} VALUES('s',NULL,?1)"),
        [boot().timestamp_millis() + 3600000],
    )
    .unwrap();
    c
}
fn oc_insert(c: &Connection, v2: bool, id: &str, kind: &str, mut data: Value, step: i64) {
    let m = if v2 { "session_message" } else { "message" };
    let t = boot().timestamp_millis() + step * 1000;
    data["role"] = json!(kind);
    if kind == "assistant" {
        data["time"] = json!({"created":t,"completed":t});
    }
    c.execute(
        &format!("INSERT INTO {m} VALUES(?1,'s',?2,?3,?4,?4)"),
        rusqlite::params![id, data.to_string(), kind, t],
    )
    .unwrap();
}
fn oc_usage() -> Value {
    json!({"tokens":{"input":10,"output":20,"reasoning":3,"cache":{"read":30,"write":5}},"cost":0.01,"modelID":"m"})
}
#[test]
fn opencode_v1_aggregates_tools_until_final_not_every_request() {
    let c = oc_db(false);
    oc_insert(&c, false, "u", "user", json!({}), 1);
    let mut first = oc_usage();
    first["finish"] = json!("tool-calls");
    oc_insert(&c, false, "a", "assistant", first, 2);
    assert!(opencode_rows(&c, boot(), false).unwrap().is_empty());
    let mut last = oc_usage();
    last["finish"] = json!("stop");
    oc_insert(&c, false, "b", "assistant", last, 3);
    let n = opencode_rows(&c, boot(), false).unwrap().remove(0);
    assert_eq!(
        n.tokens,
        Tokens {
            input: 90,
            output: 46,
            cached: 60,
            reasoning: 6
        }
    );
    assert_eq!(n.requests, 2);
    assert_eq!(n.cost, Some(0.02));
    assert_eq!(opencode_rows(&c, boot(), true).unwrap().len(), 2);
}
#[test]
fn opencode_v2_waits_idle_includes_compaction_and_prefers_v2() {
    let c = oc_db(true);
    c.execute_batch("CREATE TABLE session(id); CREATE TABLE message(id);")
        .unwrap();
    oc_insert(&c, true, "u", "user", json!({}), 1);
    oc_insert(&c, true, "a", "assistant", oc_usage(), 2);
    let mut comp = oc_usage();
    comp["status"] = json!("completed");
    oc_insert(&c, true, "c", "compaction", comp, 3);
    assert!(opencode_rows(&c, boot(), false).unwrap().is_empty());
    oc_insert(&c, true, "idle", "idle", json!({"outcome":"succeeded"}), 4);
    let n = opencode_rows(&c, boot(), false).unwrap().remove(0);
    assert_eq!(n.tokens.output, 46);
    assert_eq!(n.requests, 2);
    assert!(!n.interrupted);
    assert!(
        opencode_rows(&c, "2026-10-18T00:00:00Z".parse().unwrap(), false)
            .unwrap()
            .is_empty()
    );
}
#[test]
fn hook_metadata_drops_all_conversation_credentials_and_marks_missing_usage() {
    let v = json!({"session_id":"s","prompt":"PRIVATE","last_assistant_message":"PRIVATE","apiKey":"PRIVATE","cwd":"PRIVATE"});
    let m = hook_metadata("trae", "stop", &v).unwrap();
    assert!(!m.to_string().contains("PRIVATE"));
    assert!(m["tokens"].is_null());
    assert!(hook_metadata("cursor", "stop", &json!({})).is_err());
    let m=hook_metadata("cursor","stop",&json!({"conversation_id":"c","generation_id":"g","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":3}})).unwrap();
    assert_eq!(m["tokens"]["input"], 13);
}
#[test]
fn bridge_deduplicates_whole_turn_and_ignores_old_and_wrong_sources() {
    let dir = temp("bridge");
    let mut s = SourceState::new(SourceSettings::default());
    s.boot = boot();
    for (file, event, id, source) in [
        ("1", "start", "turn", "trae"),
        ("2", "stop", "a", "trae"),
        ("3", "stop", "b", "trae"),
        ("4", "stop", "c", "cursor"),
    ] {
        fs::write(
            dir.join(format!("{file}.json")),
            json!({"at":at(),"event":event,"id":id,"source":source,"session":"s"}).to_string(),
        )
        .unwrap();
    }
    let rows = read_bridge(&dir, "trae", &mut s).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].id, rows[1].id);
    assert!(rows[0].usage_unavailable);
    assert!(read_bridge(&dir, "trae", &mut s).unwrap().is_empty());
    for e in fs::read_dir(&dir).unwrap() {
        fs::remove_file(e.unwrap().path()).unwrap();
    }
    fs::remove_dir(dir).unwrap();
}
#[test]
fn settings_migration_and_validation_preserve_other_roles_and_sounds() {
    let mut s:Settings=serde_json::from_value(json!({"characterSoundEnabled":{"Claude-Chibi":false},"characterLines":{"Claude-Chibi":{"idle":[" mine "],"bad":["no"]},"Kimi-Chibi":{"feed":["rice"]}},"usageSources":{"claude":{"enabled":true,"intervalSeconds":0},"ccswitch":{"mode":"turn"}}})).unwrap();
    validate_settings(&mut s).unwrap();
    assert!(!s.character_sound_enabled["Claude-Chibi"]);
    assert_eq!(s.character_lines["Claude-Chibi"]["idle"], vec!["mine"]);
    assert_eq!(s.character_lines["Kimi-Chibi"]["feed"], vec!["rice"]);
    assert!(!s.character_lines["Claude-Chibi"].contains_key("bad"));
    assert_eq!(s.usage_sources["claude"].interval_seconds, 2);
    assert_eq!(s.usage_sources["ccswitch"].mode, "stage");
    s.character_lines
        .get_mut("Claude-Chibi")
        .unwrap()
        .insert("idle".into(), vec!["x".repeat(301)]);
    assert!(validate_settings(&mut s).is_err());
}
#[test]
fn disabled_sources_do_not_scan_user_data() {
    let mut sources = Sources::default();
    let (events, status) = sources.poll(&Settings::default());
    assert!(events.is_empty());
    assert_eq!(status.len(), 5);
    assert!(status.values().all(|s| s == "已关闭"));
    assert!(sources.states.is_empty());
}

#[test]
fn cc_switch_first_snapshot_is_silent_and_interval_changes_do_not_replay() {
    let dir=temp("cc-baseline");let path=dir.join("cc.db");
    let c=cc_db();let schema:String=c.query_row("SELECT sql FROM sqlite_master WHERE name='proxy_request_logs'",[],|r|r.get(0)).unwrap();
    let db=Connection::open(&path).unwrap();db.execute_batch(&schema).unwrap();
    let insert=|id:&str|{db.execute("INSERT INTO proxy_request_logs VALUES(?1,'claude','test',10,2,0,0,'0',200,?2,2,NULL,'proxy')",rusqlite::params![id,Utc::now().timestamp()+1]).unwrap();};
    insert("old");let mut settings=Settings::default();settings.usage_sources.insert("ccswitch".into(),SourceSettings{enabled:true,path:path.to_string_lossy().into(),mode:"stage".into(),interval_seconds:2});
    let mut sources=Sources::default();assert!(sources.poll(&settings).0.is_empty());let baseline=sources.states["ccswitch"].boot;
    insert("new");sources.states.get_mut("ccswitch").unwrap().last=Instant::now()-Duration::from_secs(5);
    assert_eq!(sources.poll(&settings).0.len(),1);
    settings.usage_sources.get_mut("ccswitch").unwrap().interval_seconds=3;
    sources.states.get_mut("ccswitch").unwrap().last=Instant::now()-Duration::from_secs(5);
    assert!(sources.poll(&settings).0.is_empty());assert_eq!(sources.states["ccswitch"].boot,baseline);
    settings.codex_enabled=false;assert!(sources.poll(&settings).0.is_empty());assert!(sources.states["ccswitch"].boot>=baseline);
    drop(db);fs::remove_file(path).unwrap();fs::remove_dir(dir).unwrap();
}
