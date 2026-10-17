pub const MODELS: [&str;7] = ["Claude","GLM","GPT","Grok","Qwen","Gemini","Kimi"];
pub fn valid_group(group: &str) -> bool { group.strip_suffix("-Chibi").is_some_and(|m|MODELS.contains(&m)) }
pub fn valid_cue(cue: &str) -> bool { matches!(cue,"pat"|"angry"|"feed") }
pub fn valid_event(event: &str) -> bool {
    event.split_once('_').is_some_and(|(model,cue)| MODELS.iter().any(|m|m.to_lowercase()==model) && valid_cue(cue))
}
pub fn menu(group: &str) -> [String;6] {
    let (name,pat,talk)=match group {
        "Claude-Chibi" => ("Claude","摸摸 Claude 的小花","听 Claude 读一句"),
        "GLM-Chibi" => ("GLM","摸摸 GLM 的狐耳","听 GLM 的小点子"),
        "GPT-Chibi" => ("GPT","摸摸 GPT 小白龙","和 GPT 理理思路"),
        "Grok-Chibi" => ("Grok","摸摸 Grok 小恶魔","听 Grok 俏皮一句"),
        "Qwen-Chibi" => ("Qwen","摸摸 Qwen 的发辫","听 Qwen 扇间闲话"),
        "Gemini-Chibi" => ("Gemini","摸摸 Gemini 的猫耳","听 Gemini 的星光点子"),
        "Kimi-Chibi" => ("Kimi","轻轻摸摸 Kimi","听 Kimi 的月夜絮语"),
        "小鲸鱼" => ("肥鱼","摸摸大肥鱼","听肥鱼说句话"),
        _ => ("桌宠","摸摸桌宠","和桌宠说句话"),
    };
    [format!("给 {name} 开饭 · 铁盘白饭"),pat.into(),talk.into(),format!("给 {name} 顶铁盆 · 可堆叠"),format!("替 {name} 收拾餐具"),format!("查看 {name} 的最近用量")]
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn role_menus_and_sound_events_are_scoped() {
        for model in MODELS {
            let group=format!("{model}-Chibi");assert!(valid_group(&group));
            for cue in ["pat","angry","feed"] { assert!(valid_event(&format!("{}_{cue}",model.to_lowercase()))); }
            for label in menu(&group) { assert!(label.contains(model));assert!(!label.contains("肥鱼")); }
        }
        assert!(!valid_group("Other-Chibi"));assert!(!valid_event("../gpt_pat"));assert!(!valid_event("gpt_hack"));
        assert!(menu("小鲸鱼")[1].contains("肥鱼"));assert_eq!(menu("custom")[1],"摸摸桌宠");
    }
}
