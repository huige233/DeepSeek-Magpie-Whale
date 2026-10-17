//! Optional generated sprite atlas; ordinary per-state PNGs always take priority.
use std::{collections::BTreeMap, fs, io::Cursor, path::Path};
use serde::Deserialize;
use crate::types::exception::{AppError, AppResult};
use crate::types::enums::WidgetState;

#[derive(Deserialize)]
pub struct Atlas {
    pub frames: BTreeMap<String, [u32; 4]>,
    #[serde(default)]
    pub placement: Option<[i32; 4]>,
    #[serde(default)]
    pub placements: BTreeMap<String, [i32; 4]>,
    #[serde(default)]
    pub output_size: Option<[u32;2]>,
}

pub fn manifest(dir: &Path) -> Option<Atlas> {
    let path = dir.join("expressions.json");
    if fs::metadata(&path).ok()?.len() > 16_384 || !dir.join("expressions.png").is_file() { return None; }
    let atlas: Atlas = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if atlas.frames.is_empty() || atlas.frames.len() > 9 || atlas.frames.iter().any(|(key,r)|
        WidgetState::parse(key).is_none() || r[2] == 0 || r[3] == 0 || r.iter().any(|v| *v > 8192)
    ) { return None; }
    let valid = |p: [i32;4]| p[0].unsigned_abs() <= 8192 && p[1].unsigned_abs() <= 8192 && p[2] > 0 && p[3] > 0 && p[2] <= 8192 && p[3] <= 8192;
    if atlas.output_size.is_some_and(|s| s.iter().any(|v| *v == 0 || *v > 4096)) { return None; }
    if atlas.placement.is_some_and(|p| !valid(p)) || atlas.placements.iter().any(|(k,p)| !atlas.frames.contains_key(k) || !valid(*p)) { return None; }
    Some(atlas)
}

pub fn frame(dir: &Path, state: &str) -> AppResult<Vec<u8>> {
    let atlas = manifest(dir).ok_or_else(|| AppError::invalid("表情图集清单无效"))?;
    let r = atlas.frames.get(state).ok_or_else(|| AppError::not_found("图集缺少此表情"))?;
    let path = dir.join("expressions.png");
    if fs::metadata(&path).map_err(|e| AppError::io(e.to_string()))?.len() > 32 * 1024 * 1024 {
        return Err(AppError::invalid("表情图集过大"));
    }
    let bytes = fs::read(path).map_err(|e| AppError::io(e.to_string()))?;
    let reader = image::ImageReader::new(Cursor::new(&bytes)).with_guessed_format().map_err(|e| AppError::io(e.to_string()))?;
    let (w,h) = reader.into_dimensions().map_err(|e| AppError::invalid(e.to_string()))?;
    if w > 8192 || h > 8192 || !fits(*r,w,h) { return Err(AppError::invalid("表情图集裁切区域越界")); }
    let image = image::load_from_memory(&bytes).map_err(|e| AppError::invalid(e.to_string()))?;
    let mut out = Cursor::new(Vec::new());
    let mut sprite = image.crop_imm(r[0],r[1],r[2],r[3]);
    // Register every frame to the unchanged main image's display bounds.
    if let Some([x,y,w,h]) = atlas.placements.get(state).copied().or(atlas.placement) {
        let scaled = sprite.resize_exact(w as u32,h as u32,image::imageops::FilterType::Lanczos3);
        let [cw,ch] = atlas.output_size.unwrap_or([r[2],r[3]]);
        sprite = image::DynamicImage::new_rgba8(cw,ch);
        image::imageops::overlay(&mut sprite,&scaled,x as i64,y as i64);
    }
    sprite.write_to(&mut out,image::ImageFormat::Png).map_err(|e| AppError::io(e.to_string()))?;
    Ok(out.into_inner())
}

fn fits(r: [u32;4], w: u32, h: u32) -> bool {
    r[2] > 0 && r[3] > 0 && r[0].checked_add(r[2]).is_some_and(|v|v<=w) && r[1].checked_add(r[3]).is_some_and(|v|v<=h)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn isolated_frame_does_not_include_neighbor_on_fixed_canvas() {
        let dir=std::env::temp_dir().join(format!("whale-atlas-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let mut sheet=image::RgbaImage::new(32,16);
        for y in 2..14 {for x in 2..14 {sheet.put_pixel(x,y,image::Rgba([255,0,0,255]));}}
        for y in 0..16 {for x in 16..32 {sheet.put_pixel(x,y,image::Rgba([0,255,0,255]));}}
        sheet.save(dir.join("expressions.png")).unwrap();
        fs::write(dir.join("expressions.json"),r#"{"frames":{"stroking":[1,1,14,14]},"placements":{"stroking":[6,6,14,14]},"output_size":[26,26]}"#).unwrap();
        let result=image::load_from_memory(&frame(&dir,"stroking").unwrap()).unwrap().to_rgba8();
        assert_eq!(result.dimensions(),(26,26));
        assert!(result.pixels().all(|p| p[1]==0));
        assert_eq!(result.get_pixel(10,10).0,[255,0,0,255]);
        assert_eq!(result.get_pixel(0,0).0,[0,0,0,0]);
        for name in ["expressions.png","expressions.json"] {fs::remove_file(dir.join(name)).unwrap();}
        fs::remove_dir(dir).unwrap();
    }
    #[test] fn frame_bounds_reject_zero_overflow_and_outside() {
        assert!(fits([418,418,418,418],1254,1254));
        for r in [[0,0,0,1],[0,0,1,0],[100,0,500,10],[u32::MAX,0,2,2]] {assert!(!fits(r,500,500));}
    }
}
