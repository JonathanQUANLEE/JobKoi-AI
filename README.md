# 🐟 JobKoi-AI · 全智能求职锦鲤助手

> **多平台自动化求职巡航 · 工业级拟人防封风控 · AI 求职智能管家 · 简历深度诊断精修**  
> 一款基于 Tauri 2 + React 18 + Python 3.11 构建的下一代开源自动化求职与智能陪伴桌面客户端。

<p align="center">
  <a href="https://github.com/JonathanQUANLEE/JobKoi-AI"><img src="https://img.shields.io/github/stars/JonathanQUANLEE/JobKoi-AI?style=for-the-badge&logo=github&color=f59e0b" alt="GitHub stars"></a>
  <a href="https://github.com/JonathanQUANLEE/JobKoi-AI/releases"><img src="https://img.shields.io/github/v/release/JonathanQUANLEE/JobKoi-AI?style=for-the-badge&color=10b981" alt="Release"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/Language-Python%20%7C%20TypeScript%20%7C%20Rust-6366f1?style=for-the-badge" alt="Language">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="License">
</p>

---

##  项目愿景与背景 (About)

求职本该是一场双向奔赴的探索，但在如今海量招聘信息面前，求职者往往陷入日复一日的疲惫与焦虑：
- **机械重复**：每天在多个招聘平台之间频繁切换，机械点击“立即沟通”或投递简历，耗费数小时宝贵精力；
- **风控封号**：市面上的简陋爬虫脚本无节奏连击，极易触发平台反爬风控机制（如 BOSS 的 `code=37` 异常拦截、猎聘滑块验证码等），导致宝贵账号被封禁；
- **简历石沉大海**：简历千篇一律，缺乏量化成果与针对性技能关键词，难以通过平台算法和 HR 的 ATS 关键词初筛；
- **隐私隐患**：许多在线商业求职工具强制上传个人简历与平台 Cookie 至云端服务器，存在极其严重的个人隐私泄露隐患。

**JobKoi-AI（求职锦鲤）** 为终结上述痛点而生！我们致力于为每一位求职者打造一个**安全、高效、完全本地化、且有温度**的智能求职工作站。

---

##  核心特性与架构亮点

### 1.  三大主流平台并发自动化巡航
- **多平台聚合**：深度支持 **BOSS 直聘**、**猎聘 (Liepin)**、**前程无忧 (51Job)**；
- **平台独立隔离**：各平台拥有独立的受控 Chrome 会话（独立 User Data Profile），登录 Cookie 物理隔离，互不干扰；
- **免登录复用**：一次扫码登录，本地永久保持会话凭证，后续开启即刻巡航，无需反复验证。

### 2.  工业级拟人防封与风控自适应（Anti-Ban & Safe Pacing）
- **高斯随机延迟分布**：彻底告别机械均匀分布，投递停顿采用**高斯钟形曲线 + 上下限钳制**，模拟真实人类反应时间；
- **多档位节奏调节**：
  -  **冲刺效率档** (15s ~ 30s)：适合日投递量大、快速扫盘；
  -  **标准平衡档** (20s ~ 40s)：速度与安全性平衡推荐；
  -  **稳健防封档** (30s ~ 45s)：深度防封，模拟人类慢速细致阅读；
- **跨页阶梯退避 (Page-Flip Backoff)**：连续遇到已投岗位时自动拉长翻页间隔（从 4s 递增至 10~16s），并在主页面注入真实微幅滚轮事件，向平台 WAF 证明存在活跃 DOM 操作，绝不高频连击接口；
- **Code=37 智能熔断恢复**：遇到平台频控时，自动执行带看护的 90 秒冷却退避，并触发 CDP `Page.reload()` 刷新页面重置安全 Token，若重试受限则优雅挂起，宁可暂歇、绝不封号；
- **定时定点智能巡航**：支持每日指定时段（如早晨 09:30）全自动启动巡航，到点自动唤醒投递并记录成果。

### 3.  语义级多岗位输入与智能匹配算法
- **多岗位/多关键词轮巡**：支持逗号、空格、分号输入多个意向岗位（如 `AI应用工程师, AI Agent实习`），系统自动执行城市与关键词双层交叉轮巡，解决“单词投完没得投”的窘境；
- **意图分层匹配 (Smart Intent Lexicon)**：
  - L1 完整意图匹配（方向 × 性质）
  - L2 强方向匹配
  - L3 同族意图匹配
  - L4 泛方向匹配
- **解耦式防误杀规则**：标题只判定职位方向，技能关键词（如 `Python`, `LangChain`, `PyTorch`）在详情页 JD 正文中进行校验，杜绝卡片阶段因标题简略而产生的误杀；
- **黑白名单严格排除**：支持自定义负向关键词过滤（如“销售/客服/培训/实习期不留用”），一票否决不符合预期的招聘信息。

### 4.  AI 智能管家与沉浸式陪伴 (Copilot)
- **对话式全功能调控**：通过自然语言即可直接指挥助手：“调成稳健防封档”、“换成黑白极简主题”、“帮我看看刚才投的那家公司怎么样”；
- **多模型供应商自由切换**：
  - 智谱 GLM-4-Flash（国内直连响应极速）
  - OpenRouter（支持多样化免费与前沿开源模型）
  - SiliconFlow（硅基流动免费小模型端点）
  - 任意兼容 OpenAI 协议的自定义端点（DeepSeek、Claude、GPT-4o 等）；
- **动态感知与求职建议**：管家动态感知当前投递状态、在聊简历与今日战报，为你提供个性化求职答疑与面试通关建议。

### 5.  简历深度诊断与工业级精修 (Resume Polisher)
- **STAR 原则闭环重构**：对工作与项目经历按照 Situation（背景）、Task（任务）、Action（行动）、Result（结果）进行标准化重构；
- **数据化量化打磨**：自动挖掘经历中的潜在量化指标（如性能提升率、成本节省、日活规模），提升简历含金量；
- **动词升阶与 ATS 关键词加权**：替换平庸动词为高势能专业词汇，智能注入目标岗位高频技术标签；
- **前后对比与可视化雷达图**：提供精修前后高亮对比视图及多维度能力雷达图，修改痕迹清晰可查。

### 6.  100% 本地隐私无痕保障
- 本项目**无任何中央服务器收集用户数据**；
- 用户的登录凭证、Cookie、浏览历史、求职画像、原始简历与投递日志全部保存在**本机本地目录**中；
- 开源代码库 100% 剥离任何外部私钥与个人身份信息，保障开源纯粹性与安全性。

---

## 🛠️ 技术架构

```
JobKoi-AI
├── tauri-ui/                  # 前端层 (React 18 + Vite + Tailwind CSS + Lucide Icons)
│   ├── src/components/        # 巡航工作台、画像卡片、设置抽屉、AI管家、精修工作室
│   ├── src/hooks/             # 画像表单状态机、巡航事件流、管家对话 Hooks
│   └── src/lib/               # IPC 桥接契约、国际化字典 (i18n)、城市宽容分词解析
├── src-tauri/                 # 桌面宿主层 (Rust + Tauri 2.0 + PyTauri 嵌入式集成)
│   ├── Cargo.toml             # Rust 依赖声明
│   ├── tauri.conf.json        # 桌面窗口、打包标识、权限与图标配置
│   └── icons/                 # 品牌应用图标套件 (512x512, 128x128, .ico)
├── src/boss_zhipin/           # 核心业务自动化与算法层 (Python 3.11)
│   ├── website_oper/          # nodriver CDP 浏览器控制、卡片解析、打招呼
│   │   ├── core/              # 会话看护、登录检测、DOM求值、虚拟列表滚动
│   │   └── dispatch/          # 搜索直读流、推荐瀑布流、历史去重、规则引擎
│   ├── agent/                 # LLM 客户端、多模型预设、Prompt 引擎、配置加解密
│   ├── config/                # 意图分词词库、关键词裂变、防封策略、限额基线
│   ├── gui/                   # 异步 Task 调度器、状态机 (runner)、事件分发总线
│   └── tauri/commands/        # Tauri IPC 暴露命令接口 (PyTauri)
├── src/liepin/                # 猎聘 (Liepin) CDP 自动化驱动与打招呼主循环
├── src/job51/                 # 前程无忧 (51Job) CDP 自动化驱动与简历直投循环
├── scripts/                   # 生产发布脱敏工具、健康探针、定时巡航脚本
└── tests/                     # 500+ 项工业级自动化单元与集成回归测试套件
```

---

##  快速使用指南

### 方式一：下载已编译的独立安装包（适合普通求职者）

如果你不需要修改代码，最便捷的方式是直接下载我们打包好的官方桌面安装包：

1. 前往 GitHub 项目右侧的 **[Releases 发行版页面](https://github.com/JonathanQUANLEE/JobKoi-AI/releases)**；
2. 在最新版本（如 `v0.4.0`）的 **Assets** 附件列表中，下载：
   - `JobKoi-AI_x64-setup.exe`（推荐，Windows 64位标准一键安装向导）
   - 或 `JobKoi-AI_x64_zh-CN.msi`（企业级 Windows 安装包）
3. 双击下载的安装程序，按照引导完成安装并启动应用；
4. 启动后，前往「招聘平台中心」扫码登录你的账号，配置目标求职岗位，点击「开启巡航」即可全自动运行！

---

### 方式二：从源码构建与开发（适合开发者）

#### 1. 前置依赖准备
- **操作系统**：Windows 10 / 11 64位 或 macOS
- **Python**：>= 3.11（推荐使用 [uv](https://docs.astral.sh/uv/) 作为包管理工具）
- **Node.js**：>= 18.0.0 & **pnpm**：>= 8.0.0
- **Rust**：最新稳定版编译器（用于编译 Tauri 宿主端）
- **浏览器**：Google Chrome 稳定版（用于自动化 CDP 挂接）

#### 2. 克隆代码与依赖安装
```bash
# 克隆代码仓库
git clone https://github.com/JonathanQUANLEE/JobKoi-AI.git
cd JobKoi-AI

# 推荐使用 uv 极速安装 Python 环境与全部依赖
uv sync

# 安装前端依赖
cd tauri-ui
pnpm install
cd ..
```

#### 3. 运行本地自动化测试套件
本项目包含 500+ 个单元测试，覆盖意图匹配、多岗位轮巡、防封退避、IPC 契约等全部关键逻辑：
```bash
uv run pytest tests -q
```

#### 4. 启动开发调试桌面客户端
```bash
# 编译前端生产静态包
pnpm --dir tauri-ui build

# 启动 PyTauri 嵌入式桌面应用
uv run python -m boss_zhipin.tauri
```

---

##  配置与使用详解

### 1. 求职画像配置
- **目标岗位**：在「求职画像」中输入你期望的职位，支持以逗号分隔输入多个岗位名称（如：`AI应用工程师, 大模型开发, 后端实习`）；
- **城市偏好**：支持点击常用城市快捷选择，或输入任意城市名称（如：`深圳, 广州, 杭州`）；
- **筛选策略**：
  - `松散模式`：页面筛选仅作为参考，由本地智能语义引擎进行最终判定（推荐）；
  - `严格模式`：必须 100% 命中页面全部物理下拉筛选。

### 2. 免费 AI 大模型配置
进入客户端右上角「设置」$\rightarrow$「AI 智能管家设置」：
- **方案 A（开箱即用推荐）**：选择 `智谱 GLM-4-Flash`，在 [智谱 AI 开放平台](https://open.bigmodel.cn) 免费领取个人 API Key 填入即可；
- **方案 B（全球开源模型）**：选择 `OpenRouter`，在 [OpenRouter](https://openrouter.ai/keys) 注册后获取 API Key，即可调用带 `:free` 标识的全球各类免费前沿模型；
- **方案 C（自定义模型）**：可填入任意符合 OpenAI 规范的 API Base URL、API Key 与 Model 名称（如 DeepSeek-V3 / DeepSeek-R1 / Claude 3.5 Sonnet / GPT-4o 等）。

---

##  安全合规与敏感信息说明

- 本开源代码仓库已全面通过 `scripts/sanitize_for_release.py` 严格的敏感信息审查；
- 代码库中**不包含任何开发者的个人隐私、真实姓名、个人简历或任何云端 API 密钥**；
- 开发者个人调试配置与本地投递历史受到 `.gitignore` 保护，绝不会提交至公开仓库。

---

##  支持作者与 Star 计划

JobKoi-AI 是一款由求职者为求职者打造的诚意之作，开源不易，维护高频对抗的反爬规则与跨平台兼容性需要投入大量的业余时间与精力。

如果您觉得本项目对您的求职提供了实质性的帮助：
👉 **请前往本页面右上角，为我们点亮一颗 ⭐ Star！** 

每一颗 Star 都是我们持续完善防封算法、引入更多平台、丰富 AI 诊断功能的强大动力！

---

##  许可证与免责声明 (License & Disclaimer)

- 本项目基于 [MIT License](LICENSE) 协议开源发布；
- **免责声明**：本项目仅供个人求职学习、技术交流以及提高个人投递效率使用，严禁用于任何商业性批量骚扰、高频群发或非法数据爬取。使用本软件时，请务必严格遵循各平台的用户协议与服务条款，设置合理的拟人化停顿间隔与每日投递上限。因不当使用或违规操作所导致的平台限制或法律责任由使用者自行承担。
