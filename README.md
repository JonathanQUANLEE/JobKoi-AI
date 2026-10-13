# 🐟 JobKoi-AI · 全智能求职锦鲤助手

> **多平台自动化求职巡航 · 工业级拟人防封风控 · AI 求职智能管家 · 简历深度诊断精修**  
> 一款基于 Tauri 2 + React 18 + Python 3.11 构建的下一代开源求职自动化与智能陪伴桌面客户端。

<p align="center">
  <a href="https://github.com/JonathanQUANLEE/JobKoi-AI"><img src="https://img.shields.io/github/stars/JonathanQUANLEE/JobKoi-AI?style=for-the-badge&logo=github&color=f59e0b" alt="GitHub stars"></a>
  <a href="https://github.com/JonathanQUANLEE/JobKoi-AI/releases"><img src="https://img.shields.io/github/v/release/JonathanQUANLEE/JobKoi-AI?style=for-the-badge&color=10b981" alt="Release"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="License">
</p>

---

## 📖 关于本项目 (About)

**JobKoi-AI（求职锦鲤）** 诞生于求职者的真实痛点：海投简历耗尽心力、招聘平台规则繁琐、机械式打招呼效率低下且极易触发封号。

本项目通过将前沿的 **Tauri 桌面技术、拟人化浏览器自动化、以及大模型求职智能管家** 融为一体，打造了一套**安全、高效、有温度的沉浸式自动化求职工作站**：

1. **三平台并发巡航**：聚合 BOSS直聘、猎聘、前程无忧（51Job），多平台协同并发巡航；
2. **拟人化防封风控**：独创拟人化随机延迟曲线，支持「冲刺效率档 (15~30s)」与「稳健防封档 (30~45s)」自适应调速；
3. **独立 AI 智能管家**：支持自然语言指令调节速度、一秒切换极简黑白主题、诊断简历痛点、解答求职困惑；
4. **简历深度诊断精修**：支持 STAR 原则闭环重构、量化成果打磨、ATS 岗位高频关键词加权与雷达图多维评分；
5. **本地隐私无痕保障**：用户 Cookie、登录状态、个人简历与配置数据 100% 本地留存，绝不上云。

---

## 🌟 核心特性矩阵

| 模块 | 核心功能 | 核心价值 |
| :--- | :--- | :--- |
| **巡航工作台** (`workbench`) | 轮盘式巡航控制、实时投递看板、实时日志流、即时审核交互 | 自动化巡航主阵地，一览掌控当前求职进度 |
| **求职画像** (`profile`) | 目标岗位、城市偏好、薪资区间、学历要求、匹配/排除黑名单规则 | 精准定义理想目标，避免无意义岗位消耗沟通额度 |
| **简历管理** (`resumes`) | 本地多版本简历资料库、一键设为默认、提取核心技能亮点 | 本地化安全管理，随心切换针对性简历版本 |
| **简历精修** (`polish`) | AI 深度诊断、逻辑闭环改写、数据量化改写、动词升阶、前后高亮对比 | 工业级简历重构工作室，让履历初筛通过率飙升 |
| **AI 智能管家** (`copilot`) | 对话式整站调控、外观换肤、调速风控、在聊简历感知、求职陪伴 | 7×24 小时随身求职顾问与全能操作中枢 |
| **数据统计与早报** (`analytics`) | 投递转化漏斗、每日沟通数据图表、未读回复聚合快照、AI 求职早报 | 投递成效数据化复盘，告别信息盲区 |
| **实时动态** (`live`) | 三平台实时心跳监控、拟人化动作可视化流、突发风控智能熔断 | 实时掌握后台浏览器动态，防封号可视化透明呈现 |

---

## 🎨 外观主题与极简设计

- **黑白极简高级风 (Monochrome Luxe)**：纯粹黑白高对比度，专为高专注度沉浸设计；
- **经典琥珀暖色风 (Amber Glow)**：温暖治愈的琥珀金色系，寓意求职好运。
- 无论何种主题，均支持 **0.01 秒无刷新即时切换**。

---

## 🛠️ 技术架构

```
JobKoi-AI
├── tauri-ui/                  # 前端层 (React 18 + Vite + Tailwind CSS + Lucide Icons)
├── src-tauri/                 # 桌面宿主层 (Rust + Tauri 2.0 + PyTauri 嵌入式集成)
├── src/boss_zhipin/           # 自动化与业务核心 (Python 3.11)
│   ├── website_oper/          # BOSS直聘 CDP 自动化与拟人交互
│   ├── agent/                 # AI 求职画像提炼与智能管家 Prompt 引擎
│   └── tauri/commands/        # Tauri IPC 桥接命令层
├── liepin/                    # 猎聘自动化驱动层
├── job51/                     # 51Job 自动化驱动层
└── tests/                     # 450+ 项工业级自动化单元与回归测试套件
```

---

## 🚀 快速启动

### 方式一：下载发布版 EXE（适合普通用户）
前往 [Releases 页面](https://github.com/JonathanQUANLEE/JobKoi-AI/releases) 下载最新版的 Windows 安装包 `JobKoi-AI-setup.exe`，双击即可直接运行体验。

### 方式二：从源码运行（适合开发者）

#### 环境准备
- Python >= 3.11
- Node.js >= 18 & pnpm
- Google Chrome (稳定版)
- [uv](https://docs.astral.sh/uv/) (极速 Python 包管理器)

#### 本地启动
```bash
# 1. 克隆代码仓库
git clone https://github.com/JonathanQUANLEE/JobKoi-AI.git
cd JobKoi-AI

# 2. 安装 Python 依赖
uv sync

# 3. 编译并启动桌面端
pnpm --dir tauri-ui build
uv run python -m boss_zhipin.tauri
```

---

## ⭐ 支持作者与点星倡议

本项目完全开源并由作者 **[@JonathanQUANLEE](https://github.com/JonathanQUANLEE)** 倾心维护！  
如果 JobKoi-AI 为您的求职之路带来了便利，请前往仓库右上角为我们点亮一颗 **⭐ Star**！  
您的每一颗 Star，都是支撑我们持续更新防封规则、迭代 AI 能力的源动力！

---

## 📜 开源许可证与免责声明

- 本项目基于 [MIT License](LICENSE) 开源发布。
- 本工具仅供个人求职学习和提高效率使用，严禁用于任何高频骚扰或商业群发用途。请合理设置投递节奏，遵守各招聘平台服务规范。
