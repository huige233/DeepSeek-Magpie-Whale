# 七位 AI 娘素材来源与借鉴说明

适用文件：`DeepSeek-Magpie-Whale-2.8.3-Portable-With-Characters.zip`。程序为已发布的 2.8.3，另附七组角色素材；没有个人配置或日志。来源整理日期：2026-10-25。

## 图像制作

七位角色的主图使用内置 `image_gen` 工具，参考下列社区作品的发色、饰物和服装特征，改编为原肥鱼桌宠的透明背景、头肩构图和简化画风。表情在固定主图画布上局部注册，沿用 2.7.0 稳定表情素材；本次打包没有重绘或修改图片。工具没有公开具体模型版本，不宣称使用了某个特定版本的图像模型。

角色性格、互动台词及合成提示音是本项目的桌宠创作设定，不代表 AI 模型能力或官方人设，也不表示原作品作者或相关公司认可本项目。原生成提示词和当时记录的来源元数据保存在包内 `character-art/character-sources.json`。

## 逐角色参考来源

来源站点为用户指定的 [蓝色大肥鱼](https://xn--pssy23gqgbz2d718b.com/)。下表区分站点投稿者与原作者，署名已对照原页面的 `ImageObject.creditText`；“站点允许展示/下载”的记录不扩写为通用再分发授权。原页面的投稿标签也不等于本项目重新核验了全部权利。包内 `character-art/reference-credits.json` 保留此次核对到的公开署名与许可链接。

| 角色 / 图片组目录 | 参考作品 | 署名与原始记录 |
| --- | --- | --- |
| Claude / `Claude-Chibi` | [橙发看书](https://xn--pssy23gqgbz2d718b.com/works/owner-picks202609190002.html) | 站长自用；原记录作者 `lmy414`，站长自行用 AI 生成。原许可记录为允许本站展示与下载，未记录额外通用许可。 |
| GLM / `GLM-Chibi` | [代码在自己上传](https://xn--pssy23gqgbz2d718b.com/works/glm202609220001.html) | 站点投稿者 `Yasenbaka`；标注网络整理，原作者未记录。原记录为投稿者同意收录与下载，未记录额外通用许可。 |
| GPT / `GPT-Chibi` | [白发中国结](https://xn--pssy23gqgbz2d718b.com/works/owner-picks202609190003.html) | 站长自用；原记录作者 `lmy414`，站长自行用 AI 生成。原许可记录为允许本站展示与下载，未记录额外通用许可。 |
| Grok / `Grok-Chibi` | [金发双马尾参考作品](https://xn--pssy23gqgbz2d718b.com/works/grok202609210001.html) | 站点投稿者 `NakashimaYuki0912`；原记录的生成备注为“GPT画的”，标注自行创作或生成，投稿者将参考作品标注为 CC0。此标注来自投稿信息，并非将其余六组素材统一列为 CC0。 |
| Qwen / `Qwen-Chibi` | [紫发折扇 · Qwen 娘半身像](https://xn--pssy23gqgbz2d718b.com/works/qwen202610120001.html) | 站点图片署名 `c'x`；原页面注明原作者未标注、授权状态不明。 |
| Gemini / `Gemini-Chibi` | [Gemini 娘：小基基…](https://xn--pssy23gqgbz2d718b.com/works/gemini202610110001.html) | 站点图片署名“库莉茜耶”；原页面注明原作者未标注、授权状态不明。 |
| Kimi / `Kimi-Chibi` | [Kimi娘：眼镜一推，彩虹就绪](https://xn--pssy23gqgbz2d718b.com/works/kimi202610150001.html) | 站点图片署名“kimi本米”；原页面注明原作者未标注、授权状态不明。 |

参考作品、衍生形象、商标及第三方资源权利仍归相应权利人。项目代码的 MIT 许可证不构成对这些资源的额外授权；未记录许可的条目保留该状态，不标为 MIT、CC0 或官方授权。

## 借鉴的仓库与其他资源

| 来源 | 使用或借鉴的部分 / 随包声明 |
| --- | --- |
| [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) | `For–WinDesktop` 分支的 Tauri 桌宠代码、原肥鱼形象、气泡、设置与内置字体；参考 Codex 用量展示。保留原版权和根目录 `LICENSE`。 |
| [VKmich16/VK-1](https://github.com/VKmich16/VK-1) | 铁盆锚定、2/3 盆高间距、堆叠补位思路；白饭、铁盆及喂食音效素材。保留 `LICENSE-VK1.txt`（MIT）。 |
| [yetone/magpie](https://github.com/yetone/magpie) | 本机额度与用量接口数据结构的只读适配参考。 |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) / [anomalyco/opencode](https://github.com/anomalyco/opencode) | 本地用量数据结构适配；上游还包含 cc-switch 供应商预设和 logo。适配及 SQLite 依赖声明见 `THIRD-PARTY-ADAPTERS.txt`。 |
| Claude Code / Cursor / Trae 官方 Hook 文档 | 仅参考事件和数据结构；地址保留在 `THIRD-PARTY-ADAPTERS.txt`。 |

七位角色各三种互动提示音共 21 个，由本项目 `tools/generate_character_sounds.py` 原创合成，随 EXE 提供；不是角色配音、克隆声音或第三方音乐采样。铁砧金属碰撞声也是本项目程序合成，说明见 `ANVIL-SOURCE.txt`。角色音效说明另附 `CHARACTER-AUDIO-SOURCE.txt`。

教程字体随上游程序内置，内部标识 `XQBDDZRJ`，版权元数据为 NIPPER (WUHAN) TECHNOLOGY CO.,LTD.；代码许可证不改变字体权利。本包没有复制用户安装的系统字体、个人音频或自定义角色。

## 文件与设置边界

本包的 `data` 只允许包含七个 `*-Chibi` 目录内的 `main.png`、`expressions.png`、`meta.json`、`expressions.json`。这些 JSON 是角色素材定义，不是用户设置。

首次启动由程序创建默认配置。包中不含 `config.json`、`magpie.json`、账户或认证信息、会话记录、用量记录、任何日志和用户设置。升级现有安装时保留自己的 `data`，只替换 EXE 并合并需要的角色素材目录。文件清单及校验值见包内 `PACKAGE-FILES-SHA256.txt`。
