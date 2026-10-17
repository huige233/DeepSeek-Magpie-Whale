//! User-selected component sounds are copied into this app's portable data directory.
use std::{fs, path::Path, time::{SystemTime, UNIX_EPOCH}};
use base64::{Engine, engine::general_purpose::STANDARD};
use crate::infrastructure::system::paths::app_data_dir;

const LIMIT: u64 = 8 * 1024 * 1024;
pub fn valid_event(event: &str) -> bool {
    matches!(event, "pot_land" | "pot_tap" | "pot_off" | "rice_land" | "feed")
}
fn valid_file(name: &str) -> bool {
    name.len() <= 100 && !name.contains("..") && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        && name.split_once('-').is_some_and(|(event,_)| valid_event(event))
        && matches!(Path::new(name).extension().and_then(|s|s.to_str()), Some("wav"|"mp3"|"ogg"|"flac"|"m4a"))
}
pub fn valid_choice(choice: &str) -> bool {
    matches!(choice,"default"|"anvil"|"none") || choice.strip_prefix("custom:").is_some_and(valid_file)
}
fn audio_signature(bytes: &[u8], ext: &str) -> bool {
    match ext {
        "wav" => bytes.starts_with(b"RIFF") && bytes.get(8..12)==Some(b"WAVE"),
        "mp3" => bytes.starts_with(b"ID3") || bytes.len()>1 && bytes[0]==255 && bytes[1]&224==224,
        "ogg" => bytes.starts_with(b"OggS"), "flac" => bytes.starts_with(b"fLaC"),
        "m4a" => bytes.get(4..8)==Some(b"ftyp"), _=>false,
    }
}
#[tauri::command]
pub fn import_component_sound(event: String, path: String) -> Result<String,String> {
    if !valid_event(&event) {return Err("未知组件音效".into());}
    let source=Path::new(&path);
    let meta=fs::metadata(source).map_err(|_|"音效文件不可读")?;
    if !meta.is_file() || meta.len()>LIMIT {return Err("音效文件不能超过 8 MiB".into());}
    let ext=source.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
    let bytes=fs::read(source).map_err(|_|"音效读取失败")?;
    if bytes.len() as u64>LIMIT || !audio_signature(&bytes,&ext) {return Err("请选择有效的 WAV / MP3 / OGG / FLAC / M4A 音频".into());}
    let name=format!("{event}-{}.{}",SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos(),ext);
    let dir=app_data_dir().join("component-sounds");fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    fs::write(dir.join(&name),bytes).map_err(|e|e.to_string())?;
    Ok(format!("custom:{name}"))
}
#[tauri::command]
pub fn read_component_sound(choice: String) -> Result<String,String> {
    let name=choice.strip_prefix("custom:").filter(|s|valid_file(s)).ok_or("无效音效引用")?;
    let dir=app_data_dir().join("component-sounds").canonicalize().map_err(|_|"尚未导入音效")?;
    let path=dir.join(name).canonicalize().map_err(|_|"自定义音效不存在")?;
    if !path.starts_with(&dir) || fs::metadata(&path).map_err(|e|e.to_string())?.len()>LIMIT {return Err("音效路径或大小无效".into());}
    let bytes=fs::read(&path).map_err(|e|e.to_string())?;
    let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("");
    if bytes.len() as u64>LIMIT || !audio_signature(&bytes,ext) {return Err("音效文件无效".into());}
    let mime=match ext {"wav"=>"audio/wav","mp3"=>"audio/mpeg","ogg"=>"audio/ogg","flac"=>"audio/flac",_=>"audio/mp4"};
    Ok(format!("data:{mime};base64,{}",STANDARD.encode(bytes)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn choices_cannot_escape_storage() {
        assert!(valid_choice("custom:pot_land-123.wav"));assert!(valid_choice("anvil"));
        for s in ["custom:../config.json","custom:C:/test.wav","custom:pot_land-../../x.wav","custom:unknown-1.wav","https://example.com/a.mp3"] {assert!(!valid_choice(s));}
    }
    #[test] fn signatures_match_supported_audio() {
        assert!(audio_signature(b"RIFFxxxxWAVEdata","wav"));assert!(!audio_signature(b"not audio","wav"));
        assert!(!audio_signature(b"ID3","wav"));assert!(audio_signature(b"ID3data","mp3"));
    }
}
