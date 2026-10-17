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
    #[serde(default)]
    pub face_layer: Option<FaceLayer>,
}

#[derive(Deserialize)]
pub struct FaceLayer {
    pub transforms: BTreeMap<String,[f64;6]>,
    pub eyes: Vec<[f64;4]>,
    pub expression: Vec<[f64;4]>,
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
    if let Some(face)=&atlas.face_layer {
        if face.eyes.is_empty() || face.eyes.len()>4 || face.expression.len()>6 ||
            face.eyes.iter().chain(&face.expression).any(|r|r.iter().any(|v|!v.is_finite() || v.abs()>418.0) || r[2]<=0.0 || r[3]<=0.0) ||
            atlas.frames.keys().any(|key|!face.transforms.contains_key(key)) ||
            face.transforms.values().any(|m|m.iter().any(|v|!v.is_finite() || v.abs()>8192.0) || (m[0]*m[3]-m[1]*m[2]).abs()<0.01) {return None;}
    }
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
    if let Some(face)=atlas.face_layer {
        let base_path=dir.join("main.png");
        let reader=image::ImageReader::open(&base_path).map_err(|e|AppError::io(e.to_string()))?;
        let (bw,bh)=reader.into_dimensions().map_err(|e|AppError::invalid(e.to_string()))?;
        if bw==0 || bh==0 || bw>2048 || bh>2048 {return Err(AppError::invalid("主图尺寸超出表情合成限制"));}
        let base=image::open(base_path).map_err(|e|AppError::invalid(e.to_string()))?.to_rgba8();
        let mut regions=face.eyes;
        if !matches!(state,"half_closed_eyes"|"close_eyes"|"half_open_eyes") {regions.extend(face.expression);}
        sprite=image::DynamicImage::ImageRgba8(compose_face(base,&sprite.to_rgba8(),face.transforms[state],&regions));
    } else
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

// Only facial pixels change. Canvas, alpha silhouette, hair and clothes remain the original main.png.
fn compose_face(mut base:image::RgbaImage, face:&image::RgbaImage, m:[f64;6], regions:&[[f64;4]]) -> image::RgbaImage {
    let det=m[0]*m[3]-m[1]*m[2];
    let (bw,bh)=base.dimensions();
    for (x,y,pixel) in base.enumerate_pixels_mut() {
        if pixel[3]==0 {continue;}
        let px=(x as f64+0.5)*418.0/bw as f64;
        let py=(y as f64+0.5)*418.0/bh as f64;
        let weight=regions.iter().map(|r|{
            let radius=(((px-r[0])/r[2]).powi(2)+((py-r[1])/r[3]).powi(2)).sqrt();
            let t=((1.0-radius)/0.12).clamp(0.0,1.0);t*t*(3.0-2.0*t)
        }).fold(0.0_f64,f64::max);
        if weight==0.0 {continue;}
        let dx=px-m[4];let dy=py-m[5];
        let sx=(m[3]*dx-m[1]*dy)/det;let sy=(-m[2]*dx+m[0]*dy)/det;
        if sx<0.0 || sy<0.0 || sx>=face.width() as f64-1.0 || sy>=face.height() as f64-1.0 {continue;}
        let (ix,iy)=(sx.floor() as u32,sy.floor() as u32);let (fx,fy)=(sx.fract(),sy.fract());
        let points=[(ix,iy,(1.0-fx)*(1.0-fy)),(ix+1,iy,fx*(1.0-fy)),(ix,iy+1,(1.0-fx)*fy),(ix+1,iy+1,fx*fy)];
        let alpha: f64=points.iter().map(|(x,y,w)|face.get_pixel(*x,*y)[3] as f64*w).sum();
        if alpha<250.0 {continue;}
        for c in 0..3 {
            let value:f64=points.iter().map(|(x,y,w)|face.get_pixel(*x,*y)[c] as f64*w).sum();
            pixel[c]=(pixel[c] as f64*(1.0-weight)+value*weight).round() as u8;
        }
    }
    base
}

fn fits(r: [u32;4], w: u32, h: u32) -> bool {
    r[2] > 0 && r[3] > 0 && r[0].checked_add(r[2]).is_some_and(|v|v<=w) && r[1].checked_add(r[3]).is_some_and(|v|v<=h)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn face_layer_preserves_canvas_alpha_and_all_unmasked_pixels() {
        let base=image::RgbaImage::from_fn(418,418,|x,y|image::Rgba([17,25,33,if x>20 && y>20 {255}else{0}]));
        let face=image::RgbaImage::from_pixel(418,418,image::Rgba([240,80,60,255]));
        let result=compose_face(base.clone(),&face,[1.0,0.0,0.0,1.0,0.0,0.0],&[[200.0,200.0,40.0,30.0]]);
        assert_eq!(base.dimensions(),result.dimensions());
        let mut changed=0;
        for (x,y,p) in base.enumerate_pixels(){let q=result.get_pixel(x,y);assert_eq!(p[3],q[3]);
            if x<160 || x>=240 || y<170 || y>=230 {assert_eq!(p,q);}if p!=q {changed+=1;}}
        assert!(changed>1000);
    }
    #[test] fn optional_installed_pack_registration_regression() {
        let Ok(root)=std::env::var("WHALE_VERIFY_PACK") else{return;};
        let output=std::env::var("WHALE_VERIFY_RENDERED").expect("explicit test render directory");
        for model in crate::character::MODELS {
            let dir=Path::new(&root).join(format!("{model}-Chibi"));let atlas=manifest(&dir).unwrap();
            let base=image::open(dir.join("main.png")).unwrap().to_rgba8();
            let target=Path::new(&output).join(format!("{model}-Chibi"));fs::create_dir_all(&target).unwrap();
            fs::copy(dir.join("main.png"),target.join("main.png")).unwrap();
            for state in atlas.frames.keys(){
                let bytes=frame(&dir,state).unwrap();let result=image::load_from_memory(&bytes).unwrap().to_rgba8();
                assert_eq!(result.dimensions(),base.dimensions(),"{model}:{state}");
                let layer=atlas.face_layer.as_ref().unwrap();let mut regions=layer.eyes.clone();
                if !matches!(state.as_str(),"half_closed_eyes"|"close_eyes"|"half_open_eyes"){regions.extend(&layer.expression);}
                let mut changed=0;
                for (x,y,p) in base.enumerate_pixels(){let q=result.get_pixel(x,y);assert_eq!(p[3],q[3],"alpha drift {model}:{state}");
                    let px=(x as f64+0.5)*418.0/base.width() as f64;let py=(y as f64+0.5)*418.0/base.height() as f64;
                    if regions.iter().all(|r|((px-r[0])/r[2]).powi(2)+((py-r[1])/r[3]).powi(2)>=1.0){assert_eq!(p,q,"unmasked drift {model}:{state}");}
                    if p!=q {changed+=1;}
                }
                assert!(changed>100,"expression missing {model}:{state}");fs::write(target.join(format!("{state}.png")),bytes).unwrap();
            }
        }
    }
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
