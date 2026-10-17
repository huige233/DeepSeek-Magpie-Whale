# DeepSeek Magpie Whale · Windows 桌宠

## Magpie 交互版 2.8.0（2026-10-17）

### 多 IDE 读取与角色台词管理

- 设置 → 额度概览 → AI IDE 用量来源：Claude Code、CC Switch、OpenCode、Cursor、Trae 独立开关、路径与 2–300 秒读取间隔。新来源默认关闭，已有 Codex、Magpie 和音效设置保持不变。启用/切换路径或阶段模式后只提示新事件，不补弹历史。
- Claude Code：只读 `.claude/projects` JSONL（支持 `CLAUDE_CONFIG_DIR` 或自定义目录），按消息 ID 合并流式快照。整轮等待 `system/turn_duration`；`end_turn` 不足以排除 Hook 继续执行，因此不单凭它弹整轮提示。无此标记的版本可选每请求阶段模式。统计主会话记录，子代理不另行弹窗，也不宣称含未写入主记录的子代理用量。
- OpenCode：只读 `~/.local/share/opencode/opencode.db`（支持 `XDG_DATA_HOME` 和自定义路径）；V1 聚合同一用户输入的工具循环至最终响应，V2 以 `idle` 消息为终态并包含该轮压缩请求；可选每请求阶段模式。V2 优先于迁移后冻结的 V1 表。缺少支持的结构/终态时显示诊断，不猜测结束。
- CC Switch：只读 `~/.cc-switch/cc-switch.db` 的 `proxy_request_logs` 代理记录，仅作请求/阶段通知。排除导入的镜像会话，并跳过已启用原生读取的 Codex/Claude/OpenCode 来源，避免重复。按 `input_token_semantics` 区分输入是否已含缓存；没有来源定价时不把费用写成零。数据库不单列推理 Token 时无法拆分。不会读取供应商密钥、执行其用量脚本或修改 CC Switch 数据库。
- Cursor / Trae：点击「导出 Hook 接入模板」，在 `data/integrations/` 获取 JSON，手动将 `hooks` 条目合并到 IDE 配置，**不要覆盖已有 hooks**。Cursor 使用 `beforeSubmitPrompt` / `stop`；Trae 使用 `UserPromptSubmit` / `Notification` 的 `idle_prompt`（不是可被阻断的 Stop）。Cursor 配置通常为 `~/.cursor/hooks.json`，TRAE 国内版为 `~/.trae-cn/hooks.json`，或项目 `.trae/hooks.json`。国际版请以客户端 Hook 设置显示的路径为准。移动便携目录后重新导出。模板导出不会自动修改 IDE 配置。
- Hook 子进程仅保存来源、会话/轮次 ID、完成状态及可用计数，不保存提示词、回复、工具参数或密钥；以临时文件+重命名写入 `data/usage-events/<source>/`。官方事件并不保证提供 Token，缺失时明确显示「Token 未提供」，不显示虚假 0、不估算，也不触发白饭奖励。阶段通知同样不触发整轮奖励。记录仅保存在本机，可在关闭监听后清理。
- 设置 → 气泡与台词 → 台词管理：选择七位角色之一，再选闲聊/摸头/害羞/生气/提醒/失落/回来/开饭/吃饱/疲惫，逐行编辑并保存。恢复默认只影响该角色的当前场景；肥鱼和原自定义台词列表独立保留。播放模式与间隔为公共设置。
- 所有通知继续排队等待原台词结束，沿用气泡内/上方位置选项；默认整轮模式不因工具请求逐次提示。`--restore-session` 供更新后恢复运行使用，不强制打开设置或改变原隐藏状态。

适配依据（只参考数据格式，未复制供应商脚本）：[Claude Code Hooks](https://code.claude.com/docs/en/hooks)、[Cursor Hooks](https://cursor.com/docs/hooks)、[TRAE Hook 配置](https://docs.trae.cn/ide_hook-configuration-reference)、[OpenCode](https://github.com/anomalyco/opencode)、[CC Switch](https://github.com/farion1231/cc-switch)。原桌宠与餐具交互的致谢见下文。客户端版本改变可能影响本地格式；自动化验证使用隔离合成日志/数据库，不等同于所有 IDE 的真人端到端测试。

### 2.7.1 按压颜色修复

2.7.1：七位 AI 娘普通点击只保留原立绘、压扁回弹和互动音效，不再切换有肤色/腮红差异的生成摸头图；害羞、生气、眨眼等独立状态照常保留。原肥鱼与其他自定义组行为不变。

### 2.7.0 稳定表情、气泡遮挡与送饭
- 七位角色使用原始 `main.png` 作为固定画布和透明轮廓，只在注册的脸部区域显示表情；眨眼不再重新拉伸整张立绘。
- 表情图集可选 `face_layer`：相似变换矩阵 `[a,b,c,d,tx,ty]` 将独立裁切帧映射至 418 单位参考画布，`eyes` 和 `expression` 是局部椭圆混合区。眨眼只使用 `eyes`；原始主图文件不会被覆盖。
- 餐具独立窗口按气泡 SVG 路径、尾泡和用量提示制作透明遮挡区；餐具仍高于角色，但不会盖住气泡，也不抢气泡区域的鼠标。
- 按七个角色的嘴部校准送饭检测，饭团边缘接触脸前即可进食；原生鼠标位置/按键轮询补偿 WebView2 拖拽事件丢失。自然掉落、碰头仍不自动吃。
- 回归：设置 `WHALE_VERIFY_PACK` 为素材包 pic 目录、`WHALE_VERIFY_RENDERED` 为临时输出目录，运行 `cargo test --manifest-path src-tauri/Cargo.toml --lib atlas::tests` 可逐像素验证全部 56 帧：尺寸、透明轮廓和局部区域以外的像素与主图完全一致。浏览器测试可通过 `WHALE_RENDERED_DIR` 使用这些原生渲染结果。

### 本版修复与交互
- 修复七位角色按压/表情切换时图集邻格串入：透明间隔、独立裁切与固定输出画布；旧图集仍兼容。原主图保持不变。
- 白饭拖到脸前立即开吃，无须再次点击或松手；掉到头顶或自然落下不自动进食，吃完仍留下铁盆。
- 七位角色各有摸头、生气、吃饭三种原创合成短音效，共 21 个 WAV（非人物配音或游戏采样）。
- 设置 → 桌宠外观 → 每位角色的互动音效，可分别开启/关闭角色、静音某个动作、导入替换与试听；实际互动遵循原总音量开关。
- 右键喂饭、摸头、聊天、铁盆、清理和用量菜单随当前角色变化。
- 音效生成脚本：`tools/generate_character_sounds.py`；来源说明：`frontend/assets/characters/audio/SOURCE.txt`。图像参考与许可仍见独立本地素材包，不上传个人设置或日志。

- 点击额度保留原版三行气泡，字体有边界保护。
- 配置 > 气泡与台词中可选择「使用教程同款」内置字体（星期八de電子日記 / XQBDDZRJ）、系统字体或输入字体名称，字号 80%–140%，实时应用。
- 只有 Codex 整轮完成／中断触发一次通知；中间请求、工具调用不提示，原生子代理不另弹通知。
- 可选气泡内／气泡上方展示；自动提示排队，不压住当前台词。空间不足自动回到气泡内。
- 白饭从当前显示器顶部落到肥鱼前方，点击或拖到脸部松手才吃；碰头、拖到其他位置和等待不会自动吃。进食时分离米饭层和金属盆体，逐口减少白饭并飞向嘴边；吃光后留下可拖动的空铁盆。
- 铁盆采用 VK-1 的固定头顶锚点与 2/3 盆高层间距，关闭已佩戴盆的重力，逐帧跟随移动／翻转／缩放；上层后画，移除下层自动补位。
- 物理层独立于原 625px 桌宠窗口，作为 Windows owned popup 始终位于肥鱼窗口上层，保持原拖拽吸附和屏幕位置。隐藏、清空、切换显示器会清理餐具。
- Magpie 额度、Codex 日志均只读。不伪造订阅百分比扣减；不把不完整价格当整轮费用。
- 保留原 data；不读取认证文件，不改账号路由。详见 RELEASE-NOTES.txt。

验证：`cargo test --lib`、`node --test tests/companion.test.mjs`。
构建：`cd src-tauri`，`cargo build --release --features tauri/custom-protocol`。前端素材嵌入 EXE。

原生集成测试（仅隔离目录）：`cargo build --features tauri/custom-protocol,native-smoke`。
将测试 EXE 放进独立目录，并将 CODEX_HOME 指向该目录中的测试子目录，以 `--whale-smoke` 启动。
测试读取真实 WebView/IPC/日志解析路径，结果保存在测试 `data/native-smoke.jsonl`；测试只写隔离会话。
正式构建不启用 native-smoke，因此不含此测试入口。

## 借鉴与素材来源

本项目是社区修改版，不是下列上游项目的官方发行版。保留上游版权及许可声明。

| 来源 | 本项目使用 / 借鉴的部分 |
| --- | --- |
| [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) | 主要代码基础：`For–WinDesktop` 分支的 Tauri 桌宠、原有气泡和设置系统、图片与内置字体；参考 Codex 用量展示思路。原代码许可证见 `LICENSE`。 |
| [VKmich16/VK-1](https://github.com/VKmich16/VK-1) | `windows/dsh_pet.ps1` 的头顶铁盆锚定、2/3 盆高间距、堆叠次序及补位思路；米饭、铁盆和喂食音效素材。保留 `frontend/assets/feeding/LICENSE-VK1.txt`（MIT）。本版按用户需求改为点击或送到脸部才喂食，不采用超时自动吸食。 |
| [yetone/magpie](https://github.com/yetone/magpie) | 参考本机 `/v1/magpie/quotas` 和用量记录接口的数据结构；本项目是只读客户端，不修改 Magpie 账号和路由。 |

上游还包含 cc-switch 供应商预设和 logo。图片、字体、音效、商标等第三方资源权利归原权利人，不因本项目代码许可证而变更。教程字体沿用上游 `font.woff2`，字体内部标识为 XQBDDZRJ，版权元数据为 NIPPER (WUHAN) TECHNOLOGY CO.,LTD.；代码 MIT 声明不构成额外字体商用授权。

## 测试与隐私

`node --test tests/companion.test.mjs`；安装 Playwright 测试依赖后可执行 `node tests/browser.mjs`（使用本机 Edge）。截图写入已忽略的 `tests/artifacts/`。原生烟测只允许隔离的 CODEX_HOME。

可通过环境变量 `WHALE_USAGE_AUDIT=1` 临时开启本地通知验证记录 `data/usage-audit.jsonl`，只记录用量计数、事件标识和展示位置，不记录对话内容或密钥。默认关闭，日志约 1 MiB 轮换。不要上传个人 `data/`、Codex 会话、环境变量文件、烟测数据或此验证日志。

以下为原版功能说明；本 Magpie 分支隐藏原版供应商路由入口，余额与用量以本节说明为准。

> DS Desktop Whale · Standalone Windows Desktop Edition · v2.0.0

基于 [Tauri v2](https://tauri.app) 的 Windows 桌面桌宠 + DeepSeek 余额挂件：一只 Q 版小鲸鱼常驻桌面，实时展示余额与今日已用，自带本地记账、峰谷倒计时、模块化气泡、多供应商与模型路由，以及完全离线的智能抠图。

A Windows desktop pet + DeepSeek balance widget built with Tauri v2. It shows your account balance and today's usage in real time, and also ships local usage tracking, peak/off-peak countdown, modular bubbles, multi-supplier & model routing, and fully offline background removal. No browser extension and no third-party relay.

***

## 功能特性 · Features

### 桌宠本体

- **多状态形象**：生气 / 失落 / 害羞 / 疲惫 / 眨眼 / 半睁眼 / 被抚摸等状态自动或交互切换。
- **自定义挂件本体**：上传图片 → 智能抠图（Rust 原生、完全离线）→ 保存为自定义挂件组，按状态动态切换；可管理多个挂件组。
- **智能抠图**：内置 BiRefNet（birefnet-general-lite）模型与 onnxruntime，首次使用时按需下载/释放到本地，**全程无需联网推理、无需 Python**。
- **大小缩放**：挂件与气泡内容整体等比缩放，不产生「字与图两张皮」。
- **拖拽与边缘吸附**：按住拖动，松手后吸附屏幕四边；吸附距离随屏幕尺寸缩放，左侧吸附自动镜像翻转。
- **顶部吸附预留气泡区**：吸附到屏幕上沿时，气泡占据顶部预留区并完整显示、绝不超出屏幕，鲸鱼紧接在气泡下方；预留高度随挂件缩放等比变化，因此自定义大小与不同分辨率下都成立（吸附状态跨重启保持）。
- **鼠标穿透**：鲸鱼实体之外的透明区域不拦截点击，可直接操作其下方窗口。
- **互动与心情**：点击 / 长按 / 抚摸触发不同反应；失望、生气、害羞阈值与眨眼频率均可配置。
- **疲惫模式**：余额低于自定义阈值时自动切换疲惫表情并提示。
- **右键菜单**：喂养（打开充值页）、打开配置、隐藏桌宠、退出程序。
- **系统托盘**：显示/隐藏桌宠、打开配置、退出；同一时刻只允许一个实例，重复启动会唤回已有桌宠。

### 余额与记账

- **余额实时展示**：每 60 秒自动刷新，数值变化带滚动动画。
- **今日已用**：按余额差值本地记账，跨天自动归档，保留近 30 天历史。
- **多币种显示**：CNY / USD / EUR / JPY / GBP / HKD 切换，按汇率换算并缓存汇率结果。
- **失败可见**：取数失败或刚切换数据源时显示占位而非上一次的旧数字。

### Deepseek峰谷时段（谷价倒计时）

- **峰/谷标签 + 倒计时**：北京时间 09:00–12:00、14:00–18:00 为高峰，其余为空闲；实时显示当前时段与切换到下一时段的剩余时间。
- **峰谷提前预警**：进入/离开高峰前分档提醒（可开关、可配置提前分钟数）。

### 气泡

- **内置三行气泡**：余额金额 / 今日已用 / 峰谷倒计时，开箱即用。
- **模块化气泡**：自由组合文本、余额、今日已用、DS 峰谷倒计时、超链接、图片/动图六类模块；每个模块可单独设置字号、颜色、加粗/斜体/下划线、背景色、流光，并可上传字体文件。
- **气泡组管理**：新建 / 保存 / 切换 / 删除多个气泡组；编辑期间只在预览区生效，点击应用后才上屏。
- **气泡配色与重置**：气泡颜色、描边与预览实时联动，重置设置后立即生效。

### 台词与音效

- **自定义台词**：任意条数的气泡台词，支持轮播 / 随机两种播放模式，可配置间隔时长与波动幅度。
- **音效**：内置默认音效；支持上传自定义音效组（按下 / 松开 / 按下松开三种模式），音量可调。

### 供应商与模型路由

- **供应商管理**：余额数据源与各客户端（Claude Code / Codex 等）的供应商分别独立管理；每张卡片支持「应用 / 编辑 / 测试连接 / 详细账单 / 删除」，启用中的供应商受保护不会被误删。
- **预设库与图标**：内置来自 cc-switch 的供应商预设与 logo 素材，一键填充名称、请求地址、认证方式。
- **连接测试**：保存前一键测试连通性与鉴权。
- **详细账单**：按小时 / 天 / 月聚合的用量图表（ECharts），支持自定义时间区间与模型维度。
- **写入客户端配置**：把选定供应商一键写入 Claude Code / Codex 的配置文件，支持预览将要写入的文件内容、读取当前生效配置、编辑并抽取「通用配置片段」；旧版本遗留字段会自动清理。
- **模型路由**：在线拉取供应商模型列表并配置默认模型 / 模型映射。

### 系统与界面

- **开机自启**（可开关）。
- **三态主题**：浅色 / 深色 / 毛玻璃，仅作用于配置界面。
- **全局颜色**：一键调整界面主色调。
- **配置文件入口**：配置界面直接显示数据目录并可一键打开。
- **检查更新**：比对远端版本清单，有新版本时跳转发布页。
- **重置设置**：一键恢复出厂配置（含预览气泡颜色）。
- **统一提示体系**：轻提示 toast + 必要时的确认弹窗，全中文界面。

### 工程

- **DDD 分层架构**：`api → application → domain ← infrastructure`，`types` 为公共基础层，`shell` 为宿主外壳层；领域层通过仓储接口与依赖倒置解耦具体实现（详见 [1.md](./1.md)）。
- **纯原生前端**：HTML / CSS / JS，无前端框架、无打包步骤。
- **可测**：Rust 端 300+ 单元测试覆盖领域规则、用例与线缆契约。

***

## 环境要求 · Requirements

- Windows 10 / 11（自带 WebView2 运行时；缺失时安装包会引导安装）
- [Node.js](https://nodejs.org)（仅开发/构建需要）
- [Rust](https://www.rust-lang.org)（仅开发/构建需要，`rust-version = "1.77"`）

> 终端用户**无需安装 Python 或任何 AI/推理环境**——智能抠图所需的模型与 onnxruntime 已随程序分发，首次使用时释放到本地目录。

***

## 安装与运行 · Install & Run

### 直接运行

构建产物位于 `src-tauri/target/release/`：

| 文件                                                 | 说明                 |
| -------------------------------------------------- | ------------------ |
| `bundle/nsis/DS Desktop Whale_2.0.0_x64-setup.exe` | 标准安装包（当前用户模式，免管理员） |
| `DS Desktop Whale.exe`                             | 便携版，免安装，双击即用       |

### 从源码构建

```bash
# 安装前端依赖
npm install

# 开发运行（启动桌宠，可调试）
npm run dev

# 打包发布（生成 NSIS 安装包与便携版）
npm run build
```

***

## 首次使用 · First-run Setup

1. 手动启动程序时会自动打开「小鲸鱼设置」窗口（开机自启时不打扰）。
2. 在 **余额与模型路由配置 → 余额配置** 中新增一个供应商：选择预设（如 DeepSeek）或手工填写，填入 API Key。
3. 请求地址默认 `https://api.deepseek.com`，一般无需修改；保存前可点「测试连接」确认。
4. 保存并启用后，桌宠即刻开始拉取余额。
5. 需要给 Claude Code / Codex 配置模型时，切到对应客户端页签，用同一套供应商一键写入并应用。

> 随时可打开设置：右键鲸鱼 → 打开配置，或右键系统托盘图标 → 打开配置。

***

## 挂件本体与智能抠图 · Custom Widget & Matting

在「挂件配置 → 挂件本体」中可上传自定义图片作为桌宠的各个状态：

1. 点击「挂件本体」→ 新建 / 选择一个自定义挂件组。
2. 为某个状态上传图片，或点击「智能抠图」一键去背景；抠图在本地完成，可离线使用。
3. 保存后，桌宠会在对应状态下自动切换为该组图片。

***

## 数据存储 · Data Storage

所有配置与记账数据默认保存在主程序同级的 `data` 目录（安装目录不可写时回退 `%APPDATA%\DS Desktop Whale\`），不经过任何第三方平台：

```
<安装目录>\data\
├── config.json       # API Key / 请求地址 / 模型 / 挂件显示 / 台词 / 音效 / 开机自启
├── usage.json        # 小鲸鱼记账数据（含近 30 天历史归档）
├── rate_cache.json   # 汇率缓存
├── supplier\         # 供应商列表、凭证、模型目录与用量缓存
├── bubble\           # 模块化气泡：媒体文件 + 每个气泡组的 group.json
├── audio\            # 自定义音效组（按组名存放音频与 meta.json）
├── fonts\            # 上传的气泡字体
├── pic\              # 自定义挂件图片组（按组名 / 状态分类）
├── holiday\          # 峰谷日历缓存（每年一份 CN-<年份>.json）
└── ort\              # 智能抠图运行时（BiRefNet 模型 + onnxruntime）
```

API Key 仅保存在本机，程序直接请求各供应商官方接口。

***

## 目录结构 · Project Layout

```
frontend/                      # 编译期打进可执行文件的纯静态前端
├── html/                      # widget.html（桌宠窗口） / config.html（设置窗口）
├── css/
├── js/                        # 按职责拆分的原生模块（无框架、无打包）
└── assets/                    # 图标 / 挂件图 / 音效 / 字体 / 供应商预设与 logo

src-tauri/src/                 # Rust 后端（DDD 分层）
├── api/                       # 对前端的命令与线缆 DTO（camelCase）
├── application/               # 用例编排 + 仓储装配（registry / 组合根）
├── domain/                    # 领域模型与规则（model / service / repository）
├── infrastructure/            # 仓储实现、HTTP 客户端、系统能力
├── shell/                     # 宿主外壳：窗口与托盘
└── types/                     # 公共基础层：枚举、异常、工具、常量

scripts/                       # 一次性资源提取/同步脚本（预设、logo、图标、echarts）
```

***

## 常见问题 · FAQ

- **桌宠显示「尚未配置余额供应商」**：打开设置 → 余额配置，新增并启用一个供应商。
- **峰谷提示整行不见了**：峰谷是 DeepSeek 的计价规则，当前余额数据源不是 DeepSeek 时会自动隐藏。
- **法定节假日 / 补班日当天为什么没有高峰？**：假期与周六日的调休上班日都按谷价计，只有普通工作日有高峰。节假日安排按年自动获取并缓存，新一年的通知发布后会自动更新，不需要等版本升级。
- **峰谷日历取不到数据怎么办？**：无需操作。节假日数据由后端从内置的免费接口自动获取并缓存（免注册、免 AppKey），用户不需要配置任何接口地址或密钥；只有当所有免费接口都不可用时才会退化为自然周规则（不会把周末误判为高峰），网络恢复后下一次巡检会自动补齐。
- **关闭桌宠**：右键鲸鱼 → 隐藏桌宠（后台继续运行），或托盘 → 退出。
- **换电脑怎么迁移**：整个 `data` 目录随程序目录一起拷贝即可（便携版）。

***

## 致谢 · Acknowledgments

本项目由原 DSH 插件 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 独立化改造而来，感谢原作者 [MeteorNOX](https://github.com/MeteorNOX) 的创意与实现；供应商预设与 logo 素材提取自 cc-switch。许可证请以原仓库为准。

This project is derived from the original DSH extension [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget). Thanks to [MeteorNOX](https://github.com/MeteorNOX) for the original idea and implementation. Please refer to the original repository for licensing.

## 2.4.0 interactions

- Optional one-rice reward when an automatic successful Codex turn usage notice is displayed; default off. Manual history, interrupted turns and individual requests do not trigger it.
- Rice may be clicked or delivered to the face and released; head contact does not eat.
- Per-event component sound import and preview, including an original synthesized anvil-style sound (not a game recording).
- Seven generated character main images are distributed separately for local use, not included in this public source. Character references: https://xn--pssy23gqgbz2d718b.com/ and https://github.com/lmy414/bluedafeiyu ; reference image archive: https://github.com/lmy414/ai-girl-stickers . Site code licenses do not license character artwork.

## 2.5.0 七位 AI 娘互动

- 可选本地表情包：Claude、GLM、GPT、Grok、Qwen、Gemini、Kimi 各九态（原主图、三帧眨眼、摸头、害羞、生气、失落、疲惫）。基于各自原主图生成，保留发色、配饰、服装和 Q 版画风；未改写原主图。生成差分不是逐像素手绘复制。
- `data/pic/<角色>-Chibi/expressions.png` 与 `expressions.json` 构成可选图集，后端按清单读取帧并校准到原主图的显示范围，前端预取防止首次眨眼等待。已有同名状态 PNG 优先；缺少表情仍回退本角色主图。
- 七套原创陪伴文案共 154 条，覆盖闲聊、摸头、害羞、生气、连点提醒、失落、回来、开饭、吃饱、疲惫。角色性格是桌宠创作设定，不代表模型实际能力或官方人设。
- 设置 → 气泡与台词 →「七位 AI 娘使用角色专属台词」默认开启；关闭恢复用户原台词，不覆盖原自定义内容，肥鱼及其他图片组不受影响。
- 修复高分辨率自定义主图点击蒙版未缩放的问题；防止旧角色的异步蒙版覆盖新角色。自动心情台词不打断 Token 提示。
- 美术参考沿用 2.4.0 中注明的社区来源。表情包附原参考链接、署名/许可情况及生成提示词；图像不随公开源码上传，也不把代码许可证当成美术授权。

验证：`cargo test --manifest-path src-tauri/Cargo.toml --lib`；`node --test tests/companion.test.mjs tests/character-dialogue.test.mjs`；`node tests/browser.mjs`（需 Playwright/Edge）。设置 `WHALE_EXPRESSION_PACK` 为表情包的 `pic` 绝对目录，可加测 63 个实际渲染状态、自动三帧眨眼、镜像命中和专属台词。原生 smoke 测试需复制该素材包和测试音频到隔离 data，并用隔离 CODEX_HOME；不得对个人会话目录运行。smoke 中的用量核验是合成事件集成测试，不是用户真实对话目视核验。
