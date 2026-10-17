use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SystemFont {
    family: String,
    aliases: Vec<String>,
}

fn make_font(names: Vec<(String, String)>) -> Option<SystemFont> {
    let mut names: Vec<_> = names.into_iter().filter(|(_, name)| {
        !name.trim().is_empty() && !name.starts_with('@') && !name.chars().any(char::is_control)
            && name.chars().count() <= 100
    }).collect();
    names.sort_by_key(|(locale, _)| match locale.to_ascii_lowercase().as_str() {
        "zh-cn" => 0, "zh-hans" => 1, "en-us" => 2, _ => 3,
    });
    let family = names.first()?.1.clone();
    let mut aliases: Vec<_> = names.into_iter().map(|(_, name)| name).collect();
    aliases.sort();
    aliases.dedup();
    Some(SystemFont { family, aliases })
}

#[cfg(windows)]
fn enumerate() -> Result<Vec<SystemFont>, String> {
    use windows::Win32::Graphics::DirectWrite::{DWriteCreateFactory, IDWriteFactory, DWRITE_FACTORY_TYPE_SHARED};
    let read = || -> windows::core::Result<Vec<SystemFont>> {
        // Read actual family names, not registry display labels or file names.
        // COM interfaces stay on this worker thread and release through RAII.
        unsafe {
            let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
            let mut collection = None;
            factory.GetSystemFontCollection(&mut collection, true)?;
            let collection = collection.ok_or_else(windows::core::Error::from_win32)?;
            let mut fonts = Vec::new();
            for index in 0..collection.GetFontFamilyCount() {
                let names = collection.GetFontFamily(index)?.GetFamilyNames()?;
                let mut localized = Vec::new();
                for i in 0..names.GetCount() {
                    let mut locale = vec![0; names.GetLocaleNameLength(i)? as usize + 1];
                    let mut name = vec![0; names.GetStringLength(i)? as usize + 1];
                    names.GetLocaleName(i, &mut locale)?;
                    names.GetString(i, &mut name)?;
                    localized.push((String::from_utf16_lossy(&locale[..locale.len()-1]), String::from_utf16_lossy(&name[..name.len()-1])));
                }
                if let Some(font) = make_font(localized) { fonts.push(font); }
            }
            fonts.sort_by_key(|font| font.family.to_lowercase());
            fonts.dedup_by(|a, b| a.family.eq_ignore_ascii_case(&b.family));
            Ok(fonts)
        }
    };
    read().map_err(|error| format!("Cannot enumerate installed fonts: {error}"))
}

#[cfg(not(windows))]
fn enumerate() -> Result<Vec<SystemFont>, String> {
    Err("System font enumeration is only available on Windows".into())
}

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFont>, String> {
    tauri::async_runtime::spawn_blocking(enumerate).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn localized_families_keep_search_aliases_and_skip_invalid_names() {
        let font = make_font(vec![("en-us".into(), "Example".into()), ("zh-cn".into(), "示例".into()),
            ("en-us".into(), "Example".into()), ("ja-jp".into(), "@Vertical".into())]).unwrap();
        assert_eq!(font.family, "示例");
        assert_eq!(font.aliases, vec!["Example", "示例"]);
        assert!(make_font(vec![("en-us".into(), "\n".into())]).is_none());
        assert!(make_font(vec![("en-us".into(), "x".repeat(101))]).is_none());
    }

    #[cfg(windows)]
    #[test]
    fn actual_windows_collection_contains_usable_unique_families() {
        let fonts = enumerate().expect("Windows installed font collection");
        assert!(!fonts.is_empty());
        assert!(fonts.iter().any(|font| font.aliases.iter().any(|name| name == "Segoe UI")));
        assert!(fonts.windows(2).all(|pair| pair[0].family.to_lowercase() < pair[1].family.to_lowercase()));
        println!("Installed font families: {}", fonts.len());
        let matches: Vec<_> = fonts.iter().filter(|font| font.aliases.iter().any(|name| {
            name.to_lowercase().contains("aa") || name.contains("瓶盖") || name.contains("拧不")
        })).collect();
        println!("Requested font matches: {}", serde_json::to_string(&matches).unwrap());
    }
}
