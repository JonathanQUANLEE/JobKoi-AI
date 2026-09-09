# GUI v0.2 设计

- **状态**：已实现
- **日期**：2026-06-30
- **目标仓库**：`4evour/Bosszhipin-job-bot`

## 目标

v0.2 将项目从“参考旧项目改造而来”收敛为自己的产品：一个面向非技术用户的
BOSS 岗位筛选与固定招呼语沟通桌面工具。

GUI 是主入口，CLI 保留给高级用户和自动化测试。旧项目只作为浏览器自动化参考，
不继续保留它的 LLM、简历、RAG 和 provider 功能。

## 删除范围

彻底移除以下能力和入口：

- LLM 生成招呼语。
- 简历 PDF 解析。
- RAG 和向量库。
- OpenAI / DeepSeek / Claude / 通义等 provider 配置。
- LLM key、base URL、model 配置页。
- 旧历史页。
- 更新检查。
- 复杂诊断和“复制日志问 AI”入口。
- `openai`、`pypdf`、`chromadb`、`sentence-transformers` 等只服务旧能力的依赖。

删除后，项目不再要求用户配置任何 AI key，也不再读取简历。

## 保留范围

保留并产品化以下能力：

- BOSS Chrome 登录和持久化 profile。
- 岗位列表抓取、详情读取、滚动加载。
- 页面筛选点击。
- 本地 profile 规则匹配。
- 固定招呼语。
- `scan` / `review` / `auto` 三种模式。
- 随机等待范围。
- 单次发送上限。
- 每日发送上限。
- 验证码/安全验证检测后停止。
- `seen_jobs.jsonl`、`sent_jobs.jsonl`、`skipped_jobs.jsonl` 日志。
- CLI profile 运行方式。

## GUI 页面

### 1. 岗位规则

用户通过表单配置 profile 的本地规则：

- 必须包含关键词：默认 `实习`，但用户可以删除、修改、添加多个关键词。
- 任一命中关键词：默认可选 `后端开发`、`AI`、`RAG`、`大模型` 等。
- 排除关键词：默认 `销售`、`客服`、`培训`。
- 匹配范围：默认 `title`，可选 `description`、`location`、`all`。
- 匹配方式：`contains` / `regex` / `exact`。
- 大小写敏感开关。

GUI 不隐藏规则模型，用户看到的是可点击和可编辑的表单；保存后生成 profile YAML。

### 2. 页面筛选

用户选择 BOSS 页面上的筛选项：

- 城市：多选和自定义输入。
- 学历要求：多选。
- BOSS 活跃状态：多选。
- 页面筛选失败策略：
  - 默认 warning 后继续，本地规则兜底。
  - 可选 strict，失败即停止。

页面筛选只是降低抓取噪声，本地规则仍是最终安全兜底。

### 3. 招呼语

用户直接编辑固定招呼语。

- 文本框展示当前招呼语。
- 保存到 `greetings/default.txt` 或 profile 指定文件。
- 不提供 AI 生成按钮。
- 运行前校验招呼语非空，并复用现有 `validate_letter` 做长度和内容兜底。

### 4. 发送策略

用户选择运行模式和节奏：

- 模式：`scan` / `review` / `auto`。
- 随机等待：`delay_min` / `delay_max`。
- 单次发送上限：`max_sent`。
- 每日发送上限：`daily_sent_limit`。
- 遇验证码停止：默认开启。

`auto` 模式必须显示醒目的风险提示，但不阻止用户选择。

### 5. 运行面板

运行面板显示当前自动化状态：

- 浏览器/登录状态。
- 当前岗位标题、公司、地点。
- 匹配原因。
- 跳过原因。
- 已扫描数量。
- 已发送数量。
- 已跳过数量。

`review` 模式下，命中岗位后暂停并显示：

- 岗位详情。
- 匹配信息。
- 将发送的招呼语。
- 操作按钮：发送 / 跳过 / 停止。

## 数据流

```text
GUI 表单
  -> 生成/更新 profile YAML
  -> 后端加载 profile
  -> 复用 CLI 主流程
  -> 进度事件回传 GUI
  -> 日志写入 JSONL
```

CLI 不单独实现另一套逻辑。GUI 和 CLI 都使用同一份 profile、同一套 matcher、
同一条 BOSS 浏览器自动化主流程。

## 后端接口

v0.2 后端 IPC 保留最小命令：

- `list_profiles`
- `get_profile`
- `save_profile`
- `get_greeting`
- `save_greeting`
- `start_run`
- `stop_run`
- `shutdown_browser`
- `get_run_state`
- `submit_review_decision`（GUI `review` 模式按钮提交发送 / 跳过 / 停止决策所需）

删除旧 IPC：

- LLM config 相关命令。
- resume 相关命令。
- history/telemetry 相关命令。
- update check 相关命令。
- AI help report 相关命令。

## CLI

CLI 保留：

```bash
uv run main.py --profile backend-intern
```

CLI 不再检查 LLM key，不再读取简历，不再调用 provider。它只加载 profile，
打开 BOSS，按固定招呼语和规则执行。

## 依赖

Python 运行依赖保留：

- `python-dotenv`
- `PyYAML`
- `nodriver`
- Tauri 相关依赖

删除：

- `openai`
- `pypdf`
- `chromadb`
- `sentence-transformers`

如果删除依赖导致旧测试失效，应删除或改写对应旧测试，而不是保留旧功能。

## 测试策略

保留并补充以下测试：

- profile 读取、继承、保存。
- filter rules 匹配。
- fixed greeting 校验。
- 页面筛选失败 warning / strict 行为。
- `scan` 不发送。
- `review` 等待用户确认。
- `auto` 按上限和随机等待执行。
- daily limit。
- captcha stop。
- GUI profile 表单到 YAML 的转换。
- IPC 命令契约。

删除旧测试：

- LLM client。
- provider presets。
- resume parsing。
- RAG/vectorstore。
- telemetry。
- update check。

## 迁移原则

- 不追求兼容旧项目配置。
- 不保留“以后可能用到”的 AI 代码。
- 删除比隐藏更优先。
- README 只描述 v0.2 当前能力。
- `CHANGELOG.md` 记录每次删除和影响范围。

## 分阶段实施

1. 删除 LLM/RAG/简历/provider 后端能力和依赖。
2. 清理 CLI，使它只依赖 profile 和固定招呼语。
3. 清理 PyTauri 后端 IPC。
4. 重做 React GUI 页面。
5. 更新 README、`.env.example`、示例 profile。
6. 跑 Python 测试、前端构建、敏感信息扫描。
7. 提交并推送。
