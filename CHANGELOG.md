## 2026-07-05 15:26 - 整理公开仓库进度摘要

### 变更内容
- 新增并整理 `WORK_PROGRESS.md`，改为面向公开仓库的项目进度说明。
- 在文档中汇总 GUI 主入口、Profile 规则、页面筛选、本地 BOSS 活跃状态筛选、左侧岗位列表滚动、中文日志和 Dry-run/真实发送共用逻辑等当前实现进度。
- 明确文档边界，不记录个人招呼语、密钥、账号状态、本地日志和测试 profile。

### 原因
用户要求整理当前工作进度，并准备上传到自己的 GitHub 仓库；原接力文件更偏会话上下文，不适合作为公开仓库里的长期说明。

### 影响范围
- 只影响仓库文档，不改变 GUI、CLI、岗位筛选、发送逻辑或测试行为。

## 2026-07-03 00:00 - 修正岗位列表滚动和统计文案

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，`scroll_to_load_more_jobs` 优先滚动左侧岗位列表容器，找不到容器时再回退到页面滚动。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，滚动成功判断从“岗位 DOM 数量增加”扩展为“数量增加或左侧列表滚动位置/首条可见岗位变化”，兼容 BOSS 虚拟列表只保留固定数量岗位卡片的情况。
- 修改 `tauri-ui/src/lib/i18n.ts`，把 GUI 统计文案从“已扫描/已发送”调整为“已读取/已真实发送”，避免误解为 `已读取 = 已跳过 + 已真实发送`。
- 修改 `tests/test_finding_jobs_text.py`，新增左侧岗位列表滚动和虚拟列表可见内容变化的回归测试。

### 原因
用户反馈已扫描数量不等于跳过加发送，并指出拿不到新岗位时应该模拟滑动左侧岗位列表继续爬取。实际原因是统计口径不同，同时旧滚动逻辑只滚动 `window`，没有滚动 BOSS 左侧岗位列表容器。

### 影响范围
- 影响岗位列表自动续扫和 GUI 运行面板统计文案。
- 不改变岗位匹配规则、固定招呼语、审核发送、真实发送节奏或用户本地 profile/greeting 配置。

## 2026-07-02 19:45 - 默认复用当前 BOSS 页面

### 变更内容
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，GUI 启动运行时固定使用当前受控 BOSS 页面，不再展示或依赖 BOSS 起始页 URL 输入和当前页面复选框。
- 修改 `tauri-ui/src/lib/ipc.ts` 和 `src/boss_zhipin/tauri/__init__.py`，打开手动筛选页时只准备工具可控 Chrome 的 BOSS 页面，不再由 GUI 传入起始 URL。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，在当前没有受控 tab 时自动准备 BOSS 页面，并在 Windows 下按 `chrome_profile` 的 `--user-data-dir` 回收工具专用 Chrome 残留进程。
- 修改 `tauri-ui/src/lib/i18n.ts` 和 `tests/test_finding_jobs_text.py`，清理旧起始 URL 文案，并补充当前页面准备与 Chrome profile 回收的回归测试。

### 原因
用户希望不再依赖 BOSS 起始页 URL，因为平台会按定位或推荐流覆盖页面；更稳定的流程是让用户在工具专用 Chrome 中手动筛选到岗位列表，再让工具从当前页面继续爬取。

### 影响范围
- 影响 GUI 主入口、Tauri IPC、浏览器生命周期和手动筛选运行流程。
- CLI 仍保留 `BOSS_START_URL` 兼容能力，供高级用户和测试使用。
- 不改变用户本地 profile、固定招呼语、岗位匹配规则或真实发送逻辑。

## 2026-06-30 23:19 - 将 BOSS 活跃状态改为本地 OR 筛选

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增岗位卡片/详情文本中的 BOSS 活跃状态提取，支持 `刚刚活跃`、`今日活跃`、`3日内活跃`、`本周活跃` 等状态。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，运行时把 `page_filters.boss_active.values` 转为本地 `boss` 作用域的任一命中规则，并在页面点击阶段禁用 `boss_active`，避免 BOSS 网页单选控件被连续点击覆盖。
- 修改 `tests/test_finding_jobs_text.py` 和 `tests/test_review_send.py`，覆盖活跃状态提取、页面活跃筛选禁用和本地 OR 规则生效。

### 原因
用户反馈 BOSS 网页端活跃状态无法通过多选页面筛选解决，期望从岗位列表/详情中爬取状态，并按所选状态“任意一个满足即可”进行筛选。

### 影响范围
- 影响配置了 `page_filters.boss_active` 的 scan/review/auto 运行流程。
- 城市、学历等页面筛选仍按原逻辑点击；BOSS 活跃状态改为本地规则兜底，不再依赖网页端筛选控件。
- 不改变固定招呼语、发送节奏、标题关键词规则或用户本地 profile/greeting 文件内容。

## 2026-06-30 18:41 - 改进岗位列表续扫和翻页兜底

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，将全局岗位序号和当前可见卡片索引拆开，滚动后从当前可见列表第一个卡片继续扫描，并用岗位 key 去重避免重复处理。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，重复岗位只推进当前可见卡片索引，避免虚拟列表复用 15 个 DOM 卡片时消耗扫描/发送名额；连续重复过多时停止，防止死循环。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，岗位 key 在缺少标题/公司/地点时用 JD 摘要兜底，并新增 `click_next_page_if_present` 作为滚动无新岗位时的翻页兜底。
- 修改 `tests/test_scan_only.py`、`tests/test_finding_jobs_text.py`、`tests/test_review_send.py` 和 `tests/test_gui_review.py`，覆盖虚拟列表复用可见索引、翻页按钮点击和相关测试 mock。

### 原因
用户确认采用“当前可见卡片游标 + 翻页兜底”的组合方案，解决 BOSS 页面只保留约 15 个可见岗位卡片时主循环误判列表到底的问题。

### 影响范围
- 影响 scan/review/auto 三种模式的岗位列表遍历方式。
- 不改变岗位匹配规则、固定招呼语内容、发送节奏、页面筛选配置或用户本地 profile/greeting 文件。

## 2026-06-30 18:14 - 优化 GUI 运行日志和事件展示

### 变更内容
- 修改 `src/boss_zhipin/gui/events.py`，为 `ProgressEvent` 自动补充本机时间戳 `ts_local`。
- 新增 `tauri-ui/src/lib/eventDisplay.ts` 和 `tauri-ui/src/lib/eventDisplay.test.ts`，把运行事件格式化为中文标题、摘要、详情和状态级别。
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，让 progress event 同时写入运行事件和运行日志，避免后端普通日志为空时 GUI 日志面板没有内容。
- 修改 `tauri-ui/src/index.css`，把运行事件展示为时间、中文标题、摘要和详情，并区分通过、跳过和错误状态。
- 修改 `tauri-ui/src/lib/ipc.ts`，同步前端 `ProgressEvent` 的 `ts_local` 字段。
- 清理已被 `eventDisplay` 替代的旧 `runLogs` 前端 helper 和测试。

### 原因
用户反馈 GUI 运行日志不显示内容、运行事件结构不清晰，并且运行事件缺少本地时间戳。

### 影响范围
- 影响 GUI 运行日志和运行事件展示。
- 不改变岗位匹配、页面筛选、审核发送、自动发送或用户本地 profile/greeting 配置。

## 2026-06-30 18:11 - 在 sent_jobs 记录通过原因

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，`_log_sent` 写入 `sent_jobs.jsonl` 时新增顶层 `match_explanation` 字段。
- 修改 `tests/test_review_send.py`，新增测试覆盖 `sent_jobs.jsonl` 中的 `match_explanation` 和原有 `match` 结构。

### 原因
用户确认希望“通过原因”同时写到 GUI 运行日志和 `sent_jobs.jsonl`，方便后续查漏。

### 影响范围
- 影响 `sent_jobs.jsonl` 新增字段。
- 不改变岗位匹配、发送逻辑和原有 `match` 字段结构。

## 2026-06-30 18:03 - 记录通过原因并扩展 GUI 双语文案

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，`letter_sent` 事件新增 `match_explanation` 和 `match_details`，把已通过岗位的本地规则解释传给 GUI。
- 修改 `src/boss_zhipin/gui/events.py`，同步更新 `letter_sent` 事件 payload 注释。
- 修改 `tauri-ui/src/pages/Dashboard.tsx` 和新增 `tauri-ui/src/lib/runLogs.ts`，收到通过岗位事件后在运行日志追加带时间戳的通过原因，并在运行面板匹配原因中展示当前岗位的通过原因。
- 修改 `tauri-ui/src/lib/i18n.ts`，把主界面标题、表单标签、按钮、状态、空状态、审核卡片和提示信息纳入中英文翻译。
- 修改 `tests/test_review_send.py`、`tauri-ui/src/lib/i18n.test.ts`，新增 `tauri-ui/src/lib/runLogs.test.ts`，覆盖发送事件通过原因和 GUI 文案翻译。

### 原因
用户要求通过的岗位也要在日志里说明为什么通过，并指出中英文切换不应只切换匹配方式选项。

### 影响范围
- 影响 GUI 运行日志、运行面板展示和界面静态文案。
- 不改变 BOSS 页面筛选真实选项值，城市、学历和活跃状态仍按 BOSS 中文页面值提交。

## 2026-06-30 12:35 - 增加页面筛选点击选项

### 变更内容
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，为城市、学历要求和 BOSS 活跃状态增加可点击选项，同时保留自定义输入框。
- 修改 `tauri-ui/src/lib/profileForm.ts` 和 `tauri-ui/src/lib/profileForm.test.ts`，新增 `toggleCsvValue`，用于把点击选项合并到逗号分隔的自定义值中并支持再次点击移除。
- 修改 `tauri-ui/src/index.css`，新增页面筛选选项按钮样式。
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，把 GUI 默认运行模式改为 `auto`，但继续保持 Dry-run 默认开启。

### 原因
GUI v0.2 设计要求页面筛选项对非技术用户可点击选择，同时用户之前要求配置默认为 auto；此前页面筛选只有文本输入，默认运行模式仍是 scan。

### 影响范围
- 影响 GUI 页面筛选配置体验和新建 profile 时的默认运行模式。
- 不改变 profile YAML 结构、后端页面筛选点击逻辑、dry-run 默认保护或真实发送流程。

## 2026-06-30 12:31 - 收窄 GUI v0.2 IPC 契约

### 变更内容
- 修改 `src/boss_zhipin/tauri/__init__.py`，删除设计外的 `is_running`、`get_language`、`set_language` 和 `get_log_dir` IPC 命令，只保留 profile、greeting、run、browser reset、run state 和 GUI review 决策命令。
- 删除 `src/boss_zhipin/gui/env_io.py`，并修改 `tests/test_env_io.py` 验证旧 env IO 模块已移除。
- 修改 `tauri-ui/src/lib/ipc.ts`、`tauri-ui/src/App.tsx`、`tauri-ui/src/pages/Dashboard.tsx`、`tauri-ui/src/store.ts` 和 `tauri-ui/src/index.css`，移除前端对旧语言/日志目录 IPC 的调用和样式残留。
- 修改 `src/boss_zhipin/gui/i18n.py` 和 `tests/test_i18n.py`，让后端 pre-flight 报错固定使用中文，不再依赖 GUI 写入 `BOSS_LANG`。
- 新增 `tests/test_tauri_ipc_contract.py`，用 AST 锁定 GUI v0.2 后端 IPC 命令契约。
- 修改 `.env.example`、`docs/wiki/architecture.md`、`docs/wiki/faq.md` 和 `docs/wiki/designs/gui-v0.2.md`，删除旧 `BOSS_LANG/env_io` 文档残留，并把 GUI v0.2 设计状态更新为已实现。

### 原因
GUI v0.2 设计要求清理旧 `.env` 配置、历史/诊断等入口，并让 PyTauri 后端 IPC 保持最小接口；此前仍残留语言持久化、日志目录和运行状态轮询等设计外命令。

### 影响范围
- 影响 GUI IPC 暴露面和前端语言持久化行为；语言选择现在只保留当前前端会话，不再写 `.env`。
- `submit_review_decision` 作为 GUI review 模式按钮所需命令保留，并在设计文档中注明。
- 不影响 CLI profile、固定招呼语、岗位匹配、页面筛选、发送节奏、运行日志 JSONL 或真实发送流程。

## 2026-06-30 12:22 - 支持 GUI 配置 BOSS 起始页

### 变更内容
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，在基础信息中新增 `BOSS 起始页 URL` 输入框，并在加载 profile 时回填 `search.start_url`。
- 修改 `tauri-ui/src/lib/profileForm.ts` 和 `tauri-ui/src/lib/profileForm.test.ts`，让 GUI 表单保存非空起始页到 profile YAML 的 `search.start_url`。
- 修改 `src/boss_zhipin/cli.py` 和 `tests/test_main_helpers.py`，让 profile 的 `search.start_url` 应用到 `BOSS_START_URL`，GUI 与 CLI 共用同一条启动 URL 逻辑。

### 原因
README 已说明 GUI 可以粘贴手动筛选后的 BOSS 搜索页，但当前 GUI 没有对应输入框；同时用户此前反馈 BOSS 默认打开本地城市，需要可配置起始页来减少手动切换。

### 影响范围
- 影响 GUI 保存 profile、CLI/GUI 加载 profile 后选择 BOSS 起始页的行为。
- 不改变未配置 `search.start_url` 时的默认推荐 feed 行为。
- 不影响岗位匹配规则、页面筛选点击、招呼语保存或发送逻辑。

## 2026-06-30 12:20 - 补齐 GUI 运行状态快照

### 变更内容
- 新增 `src/boss_zhipin/gui/run_state.py`，缓存最近进度事件并聚合已扫描、已发送、已跳过、当前岗位、最近跳过原因和最近发送状态。
- 修改 `src/boss_zhipin/tauri/__init__.py`，在进度事件推送给前端前同步记录运行状态，并让 `get_run_state` 返回运行面板所需快照。
- 修改 `src/boss_zhipin/gui/runner.py` 和 `src/boss_zhipin/gui/__init__.py`，在运行结束、停止或测试重置时清理运行状态缓存，并更新 GUI 模块说明。
- 修改 `tauri-ui/src/lib/ipc.ts`、`tauri-ui/src/store.ts` 和 `tauri-ui/src/pages/Dashboard.tsx`，支持页面刷新后从 `get_run_state` 恢复统计、当前岗位、跳过原因和发送状态。
- 新增 `tests/test_run_state.py`，覆盖进度事件聚合、dry-run 不计入真实发送、reset 清理状态。

### 原因
GUI v0.2 设计要求运行面板展示浏览器/登录状态、当前岗位、匹配原因、跳过原因和运行统计；此前 `get_run_state` 只返回 running 与待审核岗位，刷新后状态不完整。

### 影响范围
- 影响 GUI 运行面板刷新恢复和 Tauri `get_run_state` 返回结构。
- 不改变 CLI、岗位匹配、页面筛选、发送节奏或真实发送逻辑。
- 运行结束后状态缓存会清理，避免下一轮运行看到上一轮的旧岗位。

## 2026-06-30 12:14 - 补齐 GUI profile 表单转换测试

### 变更内容
- 新增 `tauri-ui/src/lib/profileForm.ts`，把 GUI 表单到 profile YAML 数据结构的转换逻辑从页面组件中抽出为纯函数。
- 新增 `tauri-ui/src/lib/profileForm.test.ts`，覆盖关键词拆分、页面筛选、匹配方式、随机等待、发送上限和默认招呼语路径等转换结果。
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，改为调用共享的 `buildProfileData`，避免页面内维护不可单测的转换逻辑。
- 修改 `tauri-ui/package.json` 和 `tauri-ui/pnpm-lock.yaml`，新增 Vitest 测试脚本和测试依赖。

### 原因
GUI v0.2 设计要求补充“GUI profile 表单到 YAML 的转换”测试；此前转换逻辑写在 React 页面内部，只能靠构建间接覆盖，不利于后续扩展 profile 表单。

### 影响范围
- 影响 GUI 保存 profile 和启动运行前写入 profile 的数据生成路径。
- 不改变后端 profile loader、CLI `--profile` 运行方式、浏览器自动化或真实发送逻辑。
- 新增 `pnpm --dir tauri-ui test` 作为前端纯逻辑测试入口。

## 2026-06-30 12:07 - 删除旧 env 配置 IPC

### 变更内容
- 修改 `src/boss_zhipin/tauri/__init__.py`，删除旧 `get_env_fields` 和 `write_env_fields` IPC 命令。
- 修改 `src/boss_zhipin/gui/env_io.py`，删除通用 `.env` 表单字段读写和字段元数据，只保留 UI 语言 `BOSS_LANG` 的读写。
- 修改 `src/boss_zhipin/gui/__init__.py`，同步更新 GUI 工具模块说明。
- 修改 `tests/test_env_io.py`，改为验证旧 env 表单 helper 已移除，并保留 UI 语言读写测试。

### 原因
GUI v0.2 已改为 profile YAML 和固定招呼语文件驱动，设计文档要求后端 IPC 只保留最小 profile/greeting/run 命令；旧 `.env` 配置表单入口会让用户继续使用旧项目配置方式。

### 影响范围
- GUI 不再暴露或调用旧 `.env` 运行配置读写接口。
- UI 语言下拉仍通过 `BOSS_LANG` 保存，不影响运行 profile、招呼语或发送流程。
- CLI 仍可按既有方式读取 `.env` 中的兼容变量，但 GUI 主入口不再写这些运行配置。

## 2026-06-30 12:01 - 接入 GUI 审核发送控制流

### 变更内容
- 新增 `src/boss_zhipin/gui/review_control.py`，提供 GUI review 模式待审核岗位登记、等待决策、提交决策和状态读取。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，在 `BOSS_GUI_REVIEW=1` 时不再读取终端 `input()`，改为发出 `review_requested` 事件并等待 GUI 按钮提交 `send` / `skip` / `quit`。
- 修改 `src/boss_zhipin/gui/events.py`，新增 `review_requested` 和 `review_cleared` 进度事件，并移除旧 LLM 评分降级事件类型。
- 修改 `src/boss_zhipin/gui/runner.py`，运行结束、取消或测试 reset 时清理待审核岗位状态。
- 修改 `src/boss_zhipin/tauri/__init__.py`，启动 GUI run 时设置 `BOSS_GUI_REVIEW=1`，新增 `submit_review_decision` IPC，并在 `get_run_state` 返回待审核岗位。
- 修改 `tauri-ui/src/lib/ipc.ts`、`tauri-ui/src/store.ts`、`tauri-ui/src/pages/Dashboard.tsx` 和 `tauri-ui/src/index.css`，新增 GUI 审核卡片，显示岗位详情、匹配信息、将发送的招呼语，以及发送 / 跳过 / 停止按钮。
- 新增 `tests/test_gui_review.py`，覆盖 GUI 审核等待按钮决策、空闲时拒绝提交，以及主循环在 GUI 审核模式下不读取终端输入。

### 原因
GUI v0.2 设计要求 `review` 模式下命中岗位后在 GUI 内暂停，并让用户通过按钮逐条发送、跳过或停止；此前仍沿用 CLI `input()`，不适合桌面主入口。

### 影响范围
- 影响 GUI `review` 模式的人工审核路径；CLI review 未设置 `BOSS_GUI_REVIEW` 时仍保留终端输入方式。
- 新增的审核按钮只提交决策，不绕过固定招呼语校验、日志记录、dry-run 或真实发送保护。
- 运行结束或停止时会清理待审核岗位，避免 GUI 显示过期岗位。

## 2026-06-30 11:54 - 接入 GUI profile YAML 配置链路

### 变更内容
- 新增 `src/boss_zhipin/gui/profile_io.py`，提供 profile 列表、读取、保存，以及固定招呼语文件读取和保存能力。
- 新增 `tests/test_profile_io.py`，覆盖 profile 列表、保存后可被现有 loader 读取、非法 profile 名拒绝、招呼语读写和空招呼语拒绝。
- 修改 `src/boss_zhipin/tauri/__init__.py`，新增 `list_profiles`、`get_profile`、`save_profile`、`get_greeting`、`save_greeting` 和 `get_run_state` IPC，并让 `start_run` 支持按 profile 加载 YAML 后进入同一条 CLI 自动化流程。
- 修改 `tauri-ui/src/lib/ipc.ts`，同步新增 profile、greeting 和 run state IPC 类型。
- 重写 `tauri-ui/src/pages/Dashboard.tsx` 的配置读写链路：GUI 表单生成 profile YAML，招呼语保存到文件，启动时传 profile 名称给后端。
- 修改 `tauri-ui/src/index.css`，补充自动发送风险提示、运行统计卡片样式。

### 原因
GUI v0.2 设计要求主数据流从 `.env` 桥接改为 `GUI 表单 -> profile YAML -> 后端加载 profile -> 复用 CLI 主流程`，同时招呼语应保存为固定文本文件而不是 AI 或环境变量配置。

### 影响范围
- 影响桌面 GUI 的配置保存、加载和启动路径；CLI 的 `--profile` 路径继续复用原有 profile loader。
- GUI 现在能配置必须关键词、任一命中关键词、排除关键词、匹配范围、匹配方式、大小写敏感、页面筛选、发送节奏和固定招呼语文件。
- `review` 模式的 GUI 内发送/跳过/停止按钮还未接入运行时暂停控制流，本次仍只完成 profile 驱动配置链路和运行面板基础状态。

## 2026-06-30 11:42 - 清理 0.2 文档旧 AI 入口

### 变更内容
- 修改 `README.md` 和 `README_EN.md`，改为 0.2 固定招呼语、本地规则、GUI 主入口说明，删除旧 LLM/RAG/简历/provider 使用教程。
- 修改 `.env.example`，删除 AI API key、模型、简历路径等旧配置，改为 scan/review/auto、固定招呼语、标题关键词、随机等待和日志配置。
- 修改 `docs/wiki/architecture.md`、`docs/wiki/faq.md`、`docs/wiki/troubleshooting.md`，按当前本地规则和固定招呼语流程重写。
- 修改 `docs/wiki/adr/002-three-providers.md` 和 `docs/wiki/adr/003-telemetry-separate.md`，标记旧 provider 和 telemetry 设计已废弃。
- 修改 `docs/wiki/adr/005-pytauri-standalone.md`，移除 standalone 文档中关于旧 RAG/向量库体积的描述。
- 修改 `src/boss_zhipin/tauri/__init__.py`、`src/boss_zhipin/utils/retry.py` 和 `tests/test_standalone_sync.py`，清理旧 vectorstores、LLM provider、更新检查相关注释。
- 修改 `src/boss_zhipin/cli.py` 和 `src/boss_zhipin/tauri/__init__.py`，将运行入口命名从 `run_provider` 改为 `run_automation`。
- 修改 `src/boss_zhipin/audit/__init__.py`、`src/boss_zhipin/website_oper/write_response.py` 和相关测试，将审计字段从 `provider/model` 改为 `source/channel`。

### 原因
用户要求 0.2 彻底移除旧项目的 LLM/RAG、简历解析、向量库、provider 配置、复杂诊断和更新检查，并让 README 和 GUI 只描述当前保留功能。

### 影响范围
- 影响用户安装、配置和排障文档。
- 不改变浏览器抓取、岗位筛选、审核发送或自动发送运行逻辑。
- `logs/letters.jsonl` 后续新记录使用 `source/channel` 字段表示固定招呼语来源，不再使用旧 provider 命名。
- 保留测试、示例 profile 和用户固定招呼语中作为岗位方向或个人技能描述出现的 AI/RAG/LLM 字样。

## 2026-06-30 11:24 - 重做 GUI 为 0.2 单页工作台

### 变更内容
- 删除旧前端页面 `Run.tsx`、`Config.tsx`、`History.tsx` 和 `UpdateBanner.tsx`。
- 新增 `tauri-ui/src/pages/Dashboard.tsx`，把运行模式、基础信息、岗位规则、固定招呼语、发送节奏、运行事件和日志整合成一个可点击配置的主入口。
- 修改 `tauri-ui/src/App.tsx`，移除旧 tab 导航、更新提示和复制日志问 AI 入口，直接渲染 0.2 工作台。
- 修改 `tauri-ui/src/lib/ipc.ts`，删除旧 LLM 配置、简历上传、历史、更新检查和 AI 帮助 IPC 类型与调用，只保留当前后端支持的运行、停止、环境配置、语言和日志目录接口。
- 修改 `tauri-ui/src/index.css` 和 `tauri-ui/src/lib/i18n.ts`，改为工业控制台风格和最小文案集。

### 原因
用户要求 GUI 作为主入口，并面向不懂技术的人提供可点击选择的配置体验；旧 GUI 仍围绕 AI 端点、简历上传、历史页和更新提示，不符合 0.2 定位。

### 影响范围
- 前端主入口变为单页配置和运行工作台。
- 前端不再调用已删除的旧后端 IPC。
- 目前 GUI 配置通过 `.env` 桥接运行，profile 文件的可视化编辑将在后续切片继续增强。

## 2026-06-30 11:18 - 删除后端旧 AI/RAG/简历功能

### 变更内容
- 删除 `src/boss_zhipin/models/*`、`src/boss_zhipin/vectorization.py`、`src/boss_zhipin/providers.py`、`src/boss_zhipin/audit/telemetry.py` 和 `src/boss_zhipin/diagnose.py`。
- 删除 GUI 后端旧模块 `gui/llm_config.py`、`gui/resume_io.py`、`gui/diagnostics.py`、`gui/updates.py` 和 `gui/history.py`。
- 修改 `src/boss_zhipin/tauri/__init__.py`，移除 LLM 配置、简历上传、历史页、更新检查和复制日志问 AI 的旧 IPC 命令。
- 修改 `src/boss_zhipin/gui/env_io.py`，只保留固定招呼语、运行模式、发送节奏、标题关键词、扫描/审核规则等本地配置字段。
- 修改 `pyproject.toml`、Tauri 配置和前端包元数据，将版本改为 `0.2.0`，并移除 OpenAI、pypdf、chromadb、sentence-transformers、packaging 等旧依赖声明。
- 删除对应旧测试文件，并更新 env/io、路径、i18n 和包说明中的旧 AI/简历文案。

### 原因
用户明确要求仓库不再保留旧项目的 LLM/RAG、简历解析、向量库、provider 配置、复杂诊断、更新检查和桌面历史页功能，0.2 改为固定招呼语和本地规则驱动。

### 影响范围
- 后端不再提供 AI 端点配置、简历上传、LLM 成本统计、历史页读取、更新检查和复制日志问 AI IPC。
- Python 运行依赖明显减少，后续 GUI 需要改为新的 profile/规则/招呼语/发送策略主入口。
- 旧前端页面仍需下一阶段同步重做，否则会引用已删除 IPC。

## 2026-06-30 11:02 - 移除岗位主循环的 LLM 生成分支

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，删除 `generate_letter`、`should_apply` 和 provider 标签依赖，不再从岗位主循环调用 LLM 生成招呼语或简历匹配。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，精简 `send_job_descriptions_to_chat` 参数，只保留用户名、起始页、浏览器类型、岗位标签和 dry-run。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，未选择 `scan`、`review` 或 `auto` 模式时直接报错，不再回退到 LLM 生成路径。
- 修改 `tests/test_review_send.py` 和 `tests/test_scan_only.py`，删除旧 LLM/简历参数和 mock，并新增岗位主循环不再暴露 LLM/简历入口的测试。

### 原因
用户要求 0.2 彻底移除 LLM/RAG、简历解析和 provider 端点逻辑，运行流程只能依赖本地规则和用户上传/配置的固定招呼语。

### 影响范围
- 影响岗位主循环：scan/review/auto 成为唯一可运行模式。
- 自动发送和人工审核继续使用 `BOSS_FIXED_GREETING`，审计日志 provider/model 固定记录为 `fixed-greeting/local`。
- 旧 LLM 招呼语生成、简历关键词过滤、向量相似度过滤不再由主循环调用。

## 2026-06-30 10:54 - 移除 CLI 的 LLM 和简历启动依赖

### 变更内容
- 修改 `src/boss_zhipin/cli.py`，删除 CLI 启动时的 LLM 配置校验、简历路径校验、简历关键词提取和向量化入口。
- 修改 `src/boss_zhipin/cli.py`，将 `run_provider` 简化为只接收用户名、岗位标签和 dry-run，并把运行交给 profile/env 驱动的岗位主循环。
- 修改 `src/boss_zhipin/tauri/__init__.py`，同步 GUI 后端调用新 `run_provider` 签名，并移除开始运行前的简历和 LLM 必填校验。
- 修改 `tests/test_main_helpers.py`，用红灯测试锁定 CLI 不再暴露 LLM/简历启动符号，且运行入口不再传简历或 LLM 过滤参数。

### 原因
用户要求 0.2 彻底移除 LLM/RAG、简历解析、向量库和 provider 配置，并让 GUI/CLI 运行入口改为固定招呼语与本地规则驱动。

### 影响范围
- 影响 CLI 和 Tauri GUI 后端启动链路；运行不再要求 API key、模型配置或简历文件。
- 不改变浏览器岗位抓取、profile 本地规则、页面筛选、扫描/审核/自动发送模式本身。
- 旧 LLM 生成招呼语路径仍在发送主循环内，后续切片继续删除。

## 2026-06-30 00:17 - Wire profile config into CLI

### 变更内容
- 修改 `src/boss_zhipin/cli.py`，新增 `--profile` 参数解析，并在 CLI 启动时加载 `profiles/*.yml`。
- 修改 `src/boss_zhipin/cli.py`，新增 `apply_profile_to_env`，先把 profile 的 `send.mode`、`greeting_file`、`delay_min`、`delay_max`、`max_sent` 和 `search.query` 桥接到现有环境变量流程。
- 修改 `tests/test_main_helpers.py`，覆盖 `--profile` 参数解析、auto/review/scan 三种发送模式桥接、招呼语文件读取、缺失招呼语文件报错，以及 `_cli_main` 在进入运行流程前加载 profile。
- 修改 `tests/test_review_send.py` 和 `tests/test_scan_only.py`，让测试 mock 同时覆盖结构化岗位接口 `get_job_by_index` 与旧的 JD 兼容包装。
- 修改 `tests/conftest.py`，为每个测试前后清理项目环境变量，避免 profile-to-env 测试污染后续发送模式测试。

### 原因
v0.1 设计要求用户通过多 profile 配置启动 CLI，同时当前真实浏览器和发送流程仍主要依赖环境变量；先做兼容桥接可以在不重写真实发送路径的前提下接入配置文件。

### 影响范围
- 影响 CLI 启动入口；未传 `--profile` 时旧 `.env`/环境变量方式保持兼容。
- 新增 profile 到旧 env 的兼容层，暂未接入页面筛选、滚动加载、本地 matcher 到真实发送主循环。
- 测试适配结构化岗位提取接口，不改变真实发送逻辑。
- 测试环境隔离更严格，可能暴露依赖跨测试环境变量残留的用例。
- 不触发真实投递；本次只增加参数、配置桥接和单元测试。

## 2026-06-30 00:17 - Add example profiles and greeting

### 变更内容
- 新增 `profiles/base.yml`，提供默认搜索、页面筛选、本地标题规则、发送节奏和日志路径配置。
- 新增 `profiles/backend-intern.yml`，继承 base 并将标题方向关键词收窄为“后端开发”。
- 新增 `profiles/ai-intern.yml`，继承 base 并用正则匹配 AI/大模型/LLM/RAG 方向标题关键词。
- 新增 `greetings/default.txt`，保存用户指定的固定招呼语。
- 新增 `tests/test_example_profiles.py`，验证示例 profile 可加载、继承覆盖符合预期，并且 CLI 桥接能读取默认招呼语文件。

### 原因
v0.1 CLI 需要开箱可用的 profile 和招呼语样例，方便后续用户直接复制、继承和修改规则。

### 影响范围
- 新增配置和招呼语样例，不改变真实发送主流程。
- 示例 profile 默认 `send.mode=auto`，真实运行前仍应确认目标 profile、登录状态和发送上限。

## 2026-06-30 00:30 - Apply profile filters in job loop

### 变更内容
- 修改 `src/boss_zhipin/cli.py`，将 profile 中的 `filters` 序列化到 `BOSS_PROFILE_FILTERS_JSON`，供旧主流程兼容读取。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 profile filters 读取、浏览器岗位到本地 matcher 岗位结构的转换，并在扫描、审核、自动发送前执行 `match_posting`。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，主循环统一通过 `get_job_by_index` 获取标题和 JD，方便本地规则默认按 `title` 匹配。
- 修改 `tests/test_main_helpers.py` 和 `tests/test_review_send.py`，覆盖 profile filters 桥接和自动发送时按 profile 标题规则跳过不匹配岗位。
- 修改 `tests/conftest.py`，清理新增的 `BOSS_PROFILE_FILTERS_JSON`，避免测试间环境变量污染。

### 原因
v0.1 设计要求用户在 profile 中自定义标题关键词、正则和显式开关，并让这些本地规则真正控制扫描、审核和自动发送，而不是只停留在配置加载层。

### 影响范围
- 影响扫描、人工审核和自动发送三条主循环：配置了 profile filters 时优先执行本地规则；未配置时保留旧 env 规则兼容行为。
- 目前浏览器层稳定提供标题和 JD，company/location/boss 等字段暂为空，后续扩展 DOM 提取后可自动被 matcher 使用。

## 2026-06-30 00:37 - Extract structured job card fields

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，扩展浏览器层 `JobPosting` 字段，新增 `company/location/salary/tags/boss_name/boss_active_status/education/detail_url`。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，让岗位卡点击 JS 返回整张卡片文本，并新增 `_parse_job_card_text` 尽力解析标题、薪资、地点、学历、公司、BOSS 活跃状态和标签。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，将浏览器层结构化字段传给本地 filter matcher，使 `location/company/boss/all` 等规则有实际输入。
- 修改 `tests/test_finding_jobs_text.py` 和 `tests/test_review_send.py`，覆盖岗位卡字段解析、稀疏卡片兜底，以及 profile location 规则能控制自动发送。

### 原因
v0.1 设计要求 profile 支持工作城市、公司、BOSS 活跃状态等多作用域规则；在接入页面筛选前，需要浏览器层先输出可供本地 matcher 使用的结构化岗位字段。

### 影响范围
- 影响岗位提取和本地规则匹配输入；字段解析失败时返回空字符串或空列表，不阻断 JD 提取和发送流程。
- 现阶段字段来自岗位卡可见文本的启发式解析，后续可继续替换为更稳定的 DOM selector 提取。

## 2026-06-30 00:45 - Add scroll loading and in-memory dedupe

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增 `job_key`、`get_loaded_job_count` 和 `scroll_to_load_more_jobs`，支持滚动到底部后等待岗位卡数量增加。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，主循环遇到当前索引拿不到岗位时先尝试滚动加载更多，加载成功后重试当前索引。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增本轮运行内存去重，重复岗位按 `duplicate` 跳过，避免滚动后重复处理旧卡片。
- 修改 `tests/test_finding_jobs_text.py` 和 `tests/test_scan_only.py`，覆盖岗位去重 key、滚动后重试当前索引，以及重复岗位跳过。

### 原因
v0.1 设计要求自动加载更多岗位，并配合去重避免一页岗位不足或滚动后旧卡片重复进入处理队列。

### 影响范围
- 影响扫描、审核和自动发送主循环的列表到底判断：连续 miss 前会先尝试滚动加载。
- 去重目前只在单次运行内存生效；持久化 `seen_jobs_file` 仍待后续接入。

## 2026-06-30 00:50 - Document profile-driven usage

### 变更内容
- 修改 `README.md`，将快速开始调整为 profile 驱动流程，补充 `--profile backend-intern` / `--profile ai-intern` 用法。
- 修改 `README.md`，新增 Profile 用法章节，说明 `profiles/*.yml`、`greetings/default.txt`、`send.mode`、随机等待、发送上限和本地规则字段。
- 修改 `README.md`，补充 scan -> review -> auto 的安全使用顺序，以及 `BOSS_PROFILE_FILTERS_JSON` 是内部兼容变量。
- 修改 `.env.example`，提示新项目优先使用 profile，并说明自动发送相关旧环境变量仍可兼容。

### 原因
用户希望把工具沉淀成自己的项目并教会别人使用；profile 驱动方式已经接入主流程，需要在 README 和环境变量模板里给出清晰入口。

### 影响范围
- 仅影响文档和示例说明，不改变运行时代码。

## 2026-06-30 00:53 - Rename project metadata for 4evour repository

### 变更内容
- 修改 `README.md`，将项目标题、clone 地址和贡献者图链接指向 `4evour/Bosszhipin-job-bot`，并保留原项目来源说明。
- 修改 `pyproject.toml`，将包名改为 `bosszhipin-job-bot`，作者改为 `4evour`，描述改为 profile 驱动工具定位。
- 修改 `src/boss_zhipin/gui/updates.py`，将 GUI 更新检查仓库改为 `4evour/Bosszhipin-job-bot`，并同步包元数据名称。
- 修改 `tests/test_updates.py`，更新 release URL 断言。
- 更新 `uv.lock`，同步新的项目包名。

### 原因
用户希望将工具沉淀并上传到自己的 GitHub 仓库 `4evour/Bosszhipin-job-bot`，公开文档和包元数据需要与目标仓库一致。

### 影响范围
- 影响 README 安装入口、包元数据和 GUI 更新检查目标仓库。
- 不改变 CLI 命令名 `boss-zhipin` 和 Python 包导入路径 `boss_zhipin`。

## 2026-06-30 00:58 - Merge target repository initial files

### 变更内容
- 修改 `LICENSE`，合并远端初始仓库的 `4evour` 版权声明与原项目版权声明。
- 修改 `README.md`，解决与远端初始 README 的合并冲突，保留完整 profile 驱动使用教程。
- 修改 `CHANGELOG.md`，记录上传目标仓库前的冲突处理。

### 原因
目标仓库 `4evour/Bosszhipin-job-bot` 已有初始提交；推送前需要非强制合并远端历史，避免覆盖用户仓库已有内容。

### 影响范围
- 影响许可证版权声明和 README 合并结果。
- 不改变运行时代码。

## 2026-06-30 00:20 - Add local filter rule matcher

### 变更内容
- 新增 `src/boss_zhipin/config/filter_rules.py`，实现本地岗位筛选规则：`enabled` 开关、`title/description/company/boss/location/all` 作用域、`contains/regex/exact` 匹配方式、大小写控制，以及 `exclude -> required -> any` 的匹配顺序。
- 修改 `src/boss_zhipin/config/__init__.py`，导出 profile loader 与规则 matcher 的核心类型和函数。
- 新增 `tests/test_filter_rules.py`，覆盖 required 全命中、any 任一命中、disabled 规则跳过、exclude 优先、regex 大小写不敏感、exact 完整匹配、默认 title 作用域、all 作用域和无效正则报错。

### 原因
v0.1 设计要求用户通过 profile 自定义多样化关键词匹配规则，并支持正则、显式开关和默认标题匹配；实现前需要先有独立可测试的本地 matcher。

### 影响范围
- 新增独立规则匹配模块，暂未接入 CLI 主流程、浏览器自动化或真实发送逻辑。
- 现有 env 驱动的自动发送标题策略仍保持不变。

## 2026-06-29 23:35 - Add profile YAML loader foundation

### 变更内容
- 新增 `src/boss_zhipin/config/profiles.py`，实现 profile YAML 加载、`extends` 继承、dict 递归合并、list 整体替换和循环继承检测。
- 新增 `src/boss_zhipin/config/__init__.py`，作为配置模块入口。
- 新增 `tests/test_profiles_config.py`，覆盖 profile 合并、继承加载、`.yml` 文件名解析和循环继承报错。
- 修改 `pyproject.toml` 和 `uv.lock`，将 `PyYAML>=6.0` 声明为直接运行依赖。

### 原因
v0.1 设计要求使用多个可继承 profile 驱动 CLI 配置，后续标题规则、页面筛选、招呼语文件和发送节奏都需要先有稳定的配置加载底座。

### 影响范围
- 新增独立配置加载模块，暂未接入 CLI 主流程、浏览器自动化或真实发送逻辑。
- 现有 env 驱动运行方式保持不变。

## 2026-06-29 23:20 - Document profile-driven CLI v0.1 design

### 变更内容
- 新增 `docs/wiki/designs/profile-driven-cli-v0.1.md`，记录 `4evour/Bosszhipin-job-bot` v0.1 的 profile 驱动 CLI 设计。
- 文档明确多 profile 继承、显式 `enabled` 规则开关、`contains/regex/exact` 匹配、默认 `title` 作用域、页面筛选失败 warning 后继续、本地规则兜底、招呼语文件、随机发送等待范围、自动滚动加载更多、岗位去重和日志拆分。

### 原因
用户希望将当前工具沉淀为自己的开源项目，并先通过头脑风暴确定 CLI 配置化方向、可选筛选规则、页面筛选组件、自动翻页和风控节流策略。

### 影响范围
- 仅新增设计文档，不改变当前自动投递、扫描、审核或真实发送代码路径。
- 后续实现应以该设计作为 v0.1 范围边界。

## 2026-06-29 22:40 - Treat stay-on-page confirmation as sent

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `click_contact_and_send_response`，统一处理真实发送入口。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，当点击“立即沟通”后出现“已向BOSS发送消息 / 留在此页”确认弹窗时，点击“留在此页”后直接视为发送成功，不再继续等待 `#chat-input`。
- 修改 `tests/test_review_send.py`，覆盖“留在此页”确认路径不再等待聊天输入框，以及没有确认弹窗时仍回退到旧的聊天输入框发送路径。

### 原因
真实 DOM 证据显示 BOSS 现在可能在点击“立即沟通”时由网页侧直接发送预设招呼语，并弹出确认弹窗；此时页面没有 `#chat-input`，继续等待会误判失败。

### 影响范围
- 影响自动发送固定招呼语、人工审核固定招呼语和原有 LLM 招呼语三条真实发送路径。
- 保留旧聊天输入框路径作为 fallback。

## 2026-06-29 22:25 - Click stay on page before chat input

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增 `click_stay_on_page_if_present`，用于点击 BOSS 弹窗里的“留在此页”。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，在三条真实发送路径点击“立即沟通”后、等待 `#chat-input` 前调用“留在此页”处理逻辑。
- 修改 `tests/test_review_send.py` 和 `tests/test_finding_jobs_text.py`，覆盖自动发送路径会先处理“留在此页”，以及弹窗不存在时不会报错。

### 原因
真实运行时点击“立即沟通”后 BOSS 可能弹出跳转确认，如果不点击“留在此页”，脚本会找不到聊天输入框，导致发送失败。

### 影响范围
- 影响自动发送固定招呼语、人工审核固定招呼语和原有 LLM 招呼语三条真实发送路径。
- 未出现“留在此页”弹窗时只是短暂探测，不改变原有流程。

## 2026-06-29 21:45 - Return to job list after sending

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增 `return_to_job_list`：发送后通过后退返回岗位列表，并确认 `.job-card-box` 已恢复；失败时最多重试一次。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，将发送后的返回逻辑从单次 `navigate_back` 改为 `return_to_job_list`，未能回到列表时抛出明确错误。
## 2026-06-29 21:35 - Use title keyword policy for auto-send

### 变更内容
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增 `JobPosting` 和 `get_job_by_index`，点击岗位卡时同时提取岗位名称和 JD；保留 `get_job_description_by_index` 作为兼容包装。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增可复用 `KeywordPolicy`，自动发送固定招呼语模式改为只匹配岗位名称：必需命中“实习”，并命中“后端开发”或“ai”之一。
- 修改 `.env.example`、`README.md` 和 `docs/wiki/faq.md`，记录 `BOSS_AUTO_TITLE_REQUIRED_TERMS` 与 `BOSS_AUTO_TITLE_KEYWORDS` 的配置方式。
- 修改 `tests/test_review_send.py`、`tests/test_finding_jobs_text.py`、`tests/test_scan_only.py` 和 `tests/conftest.py`，覆盖标题匹配、JD 不参与自动发送判断、结构化岗位兼容、新环境变量隔离，并放宽扫描事件 payload 断言以兼容新增标题字段。

### 原因
用户反馈很多合适岗位被过滤，根因是自动发送策略拿整段 JD 判断，容易受 HR 文案、页面噪声或正文缺少“实习”影响；用户明确要求以岗位名称为准，并要求策略能作为框架给他人复用。

### 影响范围
- 影响 `BOSS_AUTO_SEND_FIXED_GREETING=1` 的自动发送固定招呼语模式。
- 扫描模式、人工审核模式、原有 LLM 生成招呼语流程仍沿用 JD 过滤逻辑，不受标题策略影响。
- 默认自动发送策略从较宽的 JD 方向词收窄为标题 `实习 + 后端开发/ai`，会减少误投，同时避免标题合适但 JD 正文缺少关键词时被误跳过。

- 修改 `tests/test_review_send.py`，补充固定招呼语发送后必须回到岗位列表，以及返回失败会报错的测试。

### 原因
用户反馈 BOSS 发送招呼语后会跳转到聊天界面，脚本需要自动回到岗位列表页继续处理后续岗位。

### 影响范围
- 影响所有真实发送路径，包括自动发送固定招呼语、人工审核固定招呼语和原有 LLM 招呼语发送。
- 扫描模式和 dry-run 不点击沟通，不受该返回逻辑影响。

## 2026-06-29 20:40 - Add auto-send fixed greeting mode

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `BOSS_AUTO_SEND_FIXED_GREETING` 自动发送模式：命中“实习 + AI应用/后端开发”后直接发送 `BOSS_FIXED_GREETING`，发送后随机等待 10~60 秒，并在 `BOSS_AUTO_SEND_MAX_SENT` 达到 50 条时停止。
- 修改 `src/boss_zhipin/cli.py`，新增 `BOSS_START_URL` 起始页覆盖和自动发送模式的免简历/免 LLM 入口判断；启动时打印当前起始页。
- 修改 `.env.example`，补充自动发送模式和起始页覆盖示例配置。
- 修改 `tests/test_review_send.py`，改写人工审核测试并新增自动发送、不提示确认、随机等待、方向过滤和 50 条上限相关用例。
- 修改 `tests/test_main_helpers.py`，补充 `BOSS_START_URL`、`BOSS_AUTO_SEND_FIXED_GREETING` 和简历预处理判断的单测。
- 修改 `README.md` 和 `docs/wiki/faq.md`，补充自动发送模式与 `BOSS_START_URL` 的使用说明。

### 原因
用户需要命中后直接发送固定招呼语，并且要能通过配置直接打开城市搜索页，避免每次都停留在默认本地 feed；同时希望发送后有随机节流并在 50 条后自动停止。

### 影响范围
- 影响 CLI 启动入口、岗位过滤逻辑、发送节流逻辑和环境变量配置方式。
- 默认未开启 `BOSS_AUTO_SEND_FIXED_GREETING` 时，旧的扫描模式和人工审核模式仍保持原样。

## 2026-06-29 19:05 - Add manual review send mode

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `BOSS_REVIEW_BEFORE_SEND` 审核发送模式：每个匹配岗位先展示岗位详情、匹配信息和固定招呼语，用户输入 `y` 才立即发送，输入 `n` 跳过，输入 `q` 退出。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `BOSS_FIXED_GREETING` 固定招呼语读取；审核发送模式不再调用 LLM 生成招呼语，未配置固定招呼语时直接报错。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `BOSS_REVIEW_REQUIRED_TERMS` 和 `BOSS_REVIEW_LOCATIONS`，审核发送模式下可在人工审核前硬过滤“实习”和目标城市；新增 `BOSS_SCAN_REQUIRED_TERMS`，扫描模式也可要求必需关键词。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，将扫描模式默认上限从 20 调整为 50。
- 修改 `src/boss_zhipin/cli.py`，启动时提示审核发送模式已开启；同时把 CLI 面向终端的错误/dry-run emoji 前缀改为 ASCII，避免 Windows GBK 控制台在错误提示时崩溃。
- 修改 `.env.example`，补充审核发送模式配置说明。
- 新增 `tests/test_review_send.py`，覆盖审核同意发送、审核跳过不发送、缺少固定招呼语报错三种路径。
- 修改 `tests/test_main_helpers.py`，覆盖缺少简历文件提示在 GBK 控制台下不会因编码崩溃。
- 修改 `tests/test_scan_only.py` 和 `tests/test_review_send.py`，覆盖默认扫描 50 个、必需关键词/城市组过滤，以及未命中“实习”时不会进入人工发送确认。

### 原因
用户需要先查看每个合适岗位的详情，逐条审核后再发送固定招呼语；同时要求边审核边发送，避免后续批量发送触发平台限流，并且不得使用 LLM 自行生成招呼语。

### 影响范围
- 影响 CLI 主流程的可选审核发送模式。
- 默认未设置 `BOSS_REVIEW_BEFORE_SEND` 时，原有 dry-run、LLM 生成和发送流程保持不变。
- 审核发送模式仍保留项目原有岗位匹配过滤、招呼语校验和 JSONL 审计日志。
- 新增硬过滤只在设置相应环境变量时生效；默认不改变原有岗位过滤行为。

## 2026-06-29 18:24 - Fix Windows dry-run bootstrap issues

### 变更内容
- 修改 `src/boss_zhipin/vectorization.py`，把向量库加载/创建时的 emoji `print` 改为 logger 输出，避免 Windows GBK 终端首次向量化时报 `UnicodeEncodeError`。
- 修改 `src/boss_zhipin/models/job_matcher.py`，当 `keywords.json` 是空数组且 LLM 已配置时重新提取关键词，避免未配置 LLM 的首次尝试把空关键词永久缓存。
- 修改 `tests/test_job_matcher.py`，新增空关键词缓存会在 LLM 已配置时重新提取的回归测试。

### 原因
本地复现 dry-run 流程时，首次向量化在 Windows 控制台因 emoji 输出崩溃；同时发现简历关键词曾在未配置 LLM 时缓存为空，导致后续配置 DeepSeek 后仍跳过关键词提取。

### 影响范围
- 影响 CLI/GUI 首次读取简历、向量化和关键词提取流程。
- 不改变岗位投递、dry-run 发送保护或浏览器自动化逻辑。

## 2026-06-29 18:00 - Add scan-only job preview mode

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，新增 `BOSS_SCAN_ONLY` 扫描模式：命中岗位后写入 `logs/scan_matches.jsonl`，不生成招呼语、不点击沟通、不发送消息；新增 `BOSS_SCAN_MAX_JOBS` 限制预览扫描数量。
- 修改 `src/boss_zhipin/cli.py`，扫描模式下跳过 LLM 配置校验、简历读取和向量化。
- 修改 `src/boss_zhipin/gui/events.py`，新增 `job_matched` 事件类型。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，增强登录态判断，识别职位页登录入口和“登录查看完整内容”等未登录信号。
- 修改 `.env.example`，补充扫描模式配置示例。
- 新增 `tests/test_scan_only.py`，覆盖扫描模式不生成、不发送的行为。
- 修改 `tests/test_finding_jobs_text.py`，覆盖职位页未登录误判场景。

### 原因
用户需要先测试岗位筛选效果，并已明确不需要生成招呼语；排查时发现项目会把未登录职位页误判为已登录，导致跳过扫码等待后抓不到岗位卡或只能看到受限内容。

### 影响范围
- 影响 CLI 主流程的可选扫描模式。
- 影响浏览器自动化登录态识别。
- 默认未设置 `BOSS_SCAN_ONLY` 时，原有生成和发送流程保持不变。
## 2026-06-30 01:13 - 完成 profile 页面筛选和状态日志

### 变更内容
- 修改 `src/boss_zhipin/cli.py`，将 profile 的 `page_filters`、`state` 和 profile 名称桥接到运行时环境变量，并把 state 路径解析为基于仓库根目录的绝对路径。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增 `apply_page_filters` 和 `click_filter_value`，支持按页面筛选组和值文本自动点击；失败时默认 warning 后继续，`strict: true` 时抛错停止。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，接入页面筛选、跨运行 `seen_jobs_file` 去重，以及 `sent_log_file` / `skipped_log_file` 结构化 JSONL 记录。
- 修改 `tests/conftest.py`、`tests/test_main_helpers.py`、`tests/test_finding_jobs_text.py`、`tests/test_scan_only.py`，补充 profile env 桥接、页面筛选降级、strict 中止、持久化去重和状态日志测试。
- 修改 `README.md`，补充 `page_filters` 和 `state` 配置说明。

### 原因
用户希望 profile 里的页面筛选、发送节奏、岗位规则和日志去重都做成可复用配置，后续他人也能直接通过多个 profile 使用，而不是依赖手动切换页面或一次性临时环境变量。

### 影响范围
- 影响 `--profile` 启动后的页面筛选、岗位去重和运行日志。
- 默认页面筛选失败不会阻断投递流程，本地 `filters` 继续兜底；只有显式设置 `page_filters.strict: true` 时才会中止。
- 未配置 `state` 时保持原有内存去重和 `letters.jsonl` 审计行为。

## 2026-06-30 01:33 - 补齐 profile 安全限制和使用教程

### 变更内容
- 修改 `src/boss_zhipin/cli.py`，将 `send.daily_sent_limit` 和 `send.stop_on_captcha` 桥接到运行时环境变量，并在加载 profile 后打印合并配置摘要。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，新增验证码/安全验证文本检测函数，只检测并停止，不做绕过。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，自动发送模式下统计当天已发送数量，达到 `daily_sent_limit` 后停止；开启 `stop_on_captcha` 时检测到验证码直接停止。
- 修改相关测试，覆盖 daily limit、captcha 停止和 profile 摘要输出。

### 原因
v0.1 设计中明确要求每日发送上限、验证码停止和启动时配置摘要。此前 profile 示例已有字段，但运行时没有执行，容易让用户误以为限制已生效。

### 影响范围
- 影响 `send.mode: auto` 的发送上限判断。
- 影响开启 `send.stop_on_captcha` 后的启动后安全校验检测。
- 影响 CLI 启动输出，方便用户确认当前 profile 的发送模式、搜索词、上限和筛选组。

## 2026-06-30 10:45 - 新增 GUI v0.2 设计

### 变更内容
- 新增 `docs/wiki/designs/gui-v0.2.md`，明确 v0.2 以 GUI 为主入口、CLI 保留给高级用户和测试。
- 设计文档明确删除 LLM 生成招呼语、简历解析、RAG、向量库、provider 配置、旧历史页、更新检查和复杂诊断。
- 设计文档明确 v0.2 GUI 页面：岗位规则、页面筛选、招呼语、发送策略、运行面板。

### 原因
用户明确要求旧项目只作为参考，仓库不要和原项目一模一样；0.2 要彻底移除旧 AI/RAG/简历能力，并升级为非技术用户可点击选择的 GUI。

### 影响范围
- 当前只新增设计文档，不改变运行时代码。
- 后续实现将以该设计为准，逐步删除旧依赖、旧 IPC 和旧 GUI 页面。

## 2026-06-30 12:38 - 清理默认个人招呼语

### 变更内容
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，将 GUI 默认招呼语改为空字符串。
- 修改 `.env.example`，将 `BOSS_FIXED_GREETING` 默认值改为空，并提示用户替换成自己的内容。
- 修改 `greetings/default.txt`，移除个人经历和 GitHub 地址，改为空文件。

### 原因
v0.2 的产品定位是用户自己填写固定招呼语，不应把某个用户的个人信息作为项目默认值。

### 影响范围
- 新用户首次打开 GUI 或复制 `.env.example` 时，需要自行填写招呼语；未填写时 review / auto 模式会在启动前拦截。
- 已保存到本地 profile 或 greeting 文件中的用户自定义内容不受影响。

## 2026-06-30 12:44 - 删除旧调试复盘文档入口

### 变更内容
- 修改 `docs/wiki/README.md`，移除旧 debugging playbook 和 CDP hang postmortem 的当前文档入口。
- 删除 `docs/wiki/debugging-playbook.md`，移除旧项目排查流程和旧诊断脚本说明。
- 删除 `docs/wiki/postmortem-2026-05-13-cdp-hang.md`，移除包含旧 LLM 调用链的历史复盘。

### 原因
v0.2 要收敛为固定招呼语、本地规则和 GUI 工作台，旧调试复盘会把新用户带回已删除的 LLM、简历和复杂诊断语境。

### 影响范围
- 当前 wiki 只保留 v0.2 仍有参考价值的架构、FAQ、排障和 ADR。
- 不影响运行时代码和测试。

## 2026-06-30 16:52 - 新增 GUI 筛选可观测性设计

### 变更内容
- 新增 `docs/superpowers/specs/2026-06-30-gui-filter-observability-design.md`，设计 GUI v0.3 的双语文案、中文解释日志、匹配范围、页面筛选结果和起始 URL 可观测性。
- 设计文档明确日志使用本机时间戳，并补充 `ts_local` JSONL 字段。
- 设计文档明确页面筛选失败默认继续运行，但必须详细报错并提示用户可手动筛选页面。

### 原因
用户反馈页面筛选和起始 URL 是否生效不可见，匹配方式英文难理解，岗位跳过日志不够详细。

### 影响范围
- 当前只新增设计文档，不改变运行时代码。
- 后续实现将影响 GUI 文案、profile 表单、matcher 解释、页面筛选日志和运行面板。

## 2026-06-30 16:58 - 支持标题加正文匹配范围

### 变更内容
- 修改 `src/boss_zhipin/config/filter_rules.py`，新增 `title_description` 匹配范围，只拼接岗位名称和岗位正文。
- 修改 `tauri-ui/src/lib/profileForm.ts`，允许 GUI profile 表单保存 `title_description` scope。
- 修改 `tests/test_filter_rules.py` 和 `tauri-ui/src/lib/profileForm.test.ts`，覆盖标题加正文匹配范围。

### 原因
用户希望 GUI 可以选择只检索岗位名称，或岗位名称和正文一起检索。

### 影响范围
- 影响 profile 本地规则匹配和 GUI 生成 YAML 的 scope 枚举。
- 默认 `title` 行为不变。

## 2026-06-30 17:03 - 增加本地规则中文解释和本机时间戳

### 变更内容
- 修改 `src/boss_zhipin/config/filter_rules.py`，新增 `explain_posting_match`，返回匹配范围、必需关键词、任一关键词、排除关键词和中文解释。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，JSONL 状态记录新增 `ts_local` 本机时间戳，并在 profile 过滤详情里写入结构化解释。
- 修改 `tests/test_filter_rules.py` 和 `tests/test_review_send.py`，覆盖中文解释结构和 `ts_local` 字段。

### 原因
用户希望日志能用中文解释岗位为什么通过或不通过，并且日志带本机时间戳。

### 影响范围
- 影响 `sent_jobs.jsonl`、`skipped_jobs.jsonl`、`seen_jobs.jsonl` 的新增字段。
- 不改变现有 `ts` 字段和本地规则匹配结果。

## 2026-06-30 17:10 - 增强页面筛选和当前页面状态事件

### 变更内容
- 修改 `src/boss_zhipin/gui/events.py` 和 `src/boss_zhipin/gui/run_state.py`，新增 `page_opened`、`page_filter` 事件和运行状态缓存。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，页面筛选失败时可发出详细中文状态，并新增当前受控页面状态查询和复用当前 tab 的入口。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，打开页面后上报请求 URL、实际 URL 和重定向状态，页面筛选逐项上报结果。
- 修改 `src/boss_zhipin/cli.py` 和 `src/boss_zhipin/tauri/__init__.py`，运行配置支持 `use_current_page`，并新增 `get_browser_page_state` IPC。
- 修改相关测试，覆盖页面筛选失败继续、URL/筛选状态缓存和 IPC 契约。

### 原因
用户反馈页面筛选和起始 URL 是否生效不可见，并希望可以手动筛选到合适页面后继续运行。

### 影响范围
- 影响 GUI 运行状态事件和后端 IPC。
- 默认仍打开起始 URL；只有 GUI 传入 `use_current_page` 时才复用当前页面。

## 2026-06-30 17:13 - 完善 GUI 双语规则选项和运行面板

### 变更内容
- 修改 `tauri-ui/src/lib/i18n.ts`，增加匹配方式和匹配范围的中英文显示文案。
- 修改 `tauri-ui/src/lib/ipc.ts` 和 `tauri-ui/src/store.ts`，同步新增页面状态、页面筛选状态和 `useCurrentPage` 配置类型。
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，匹配方式和范围改为中文/英文显示，新增“使用当前 BOSS 页面继续抓取”选项，运行面板展示请求 URL、实际 URL、URL 状态和页面筛选结果，GUI 日志前置本机时间戳。
- 新增 `tauri-ui/src/lib/i18n.test.ts`，覆盖规则选项双语文案。

### 原因
用户希望 GUI 中英文彻底分开，规则选项不再显示难懂英文，并且运行面板能看出 URL 和页面筛选是否生效。

### 影响范围
- 影响 GUI 配置页、运行面板、前端 IPC 类型和打包后的 Tauri 前端资源。
- 不改变 profile YAML 内部枚举格式。

## 2026-06-30 17:18 - 隔离示例 profile 继承测试

### 变更内容
- 修改 `tests/test_example_profiles.py`，AI profile 继承覆盖测试改为使用临时 profile 文件。

### 原因
GUI 会直接保存和覆盖 `profiles/*.yml`，测试不能依赖用户本地正在编辑的 profile 内容，否则用户设置后全量测试会失败。

### 影响范围
- 只影响测试稳定性，不改变运行时代码。

## 2026-06-30 23:40 - 修正滚动游标和活跃状态误杀

### 变更内容
- 修改 `src/boss_zhipin/website_oper/write_response.py`，移除滚动后错误重置 `window_index` 的临时逻辑，岗位列表追加加载后继续顺序扫描；同时在缺少 BOSS 活跃状态时跳过该条件，避免误杀标题/正文已命中的岗位。
- 修改 `src/boss_zhipin/config/filter_rules.py`，让多作用域规则的中文解释按作用域分别汇总，不再被最后一个 scope 覆盖。
- 修改 `tests/test_scan_only.py` 和 `tests/test_review_send.py`，增加滚动后继续扫描与“活跃状态缺失不阻挡标题命中”的回归测试。

### 原因
用户反馈岗位数超过 15 个后会退出，同时某些岗位明明命中 AI/后端/实习，却因为 BOSS 活跃状态没有采集到而被跳过，需要把这两个误判点修正掉。

### 影响范围
- 影响岗位扫描游标推进、profile 本地规则解释和 GUI 日志展示。
- 不改变固定招呼语内容，也不改用户本地 profile/greeting 配置。

## 2026-06-30 17:50 - 修复当前岗位显示上一条跳过原因

### 变更内容
- 新增 `tauri-ui/src/lib/runView.ts` 和 `tauri-ui/src/lib/runView.test.ts`，按当前岗位 `index` 查找对应的跳过或发送事件。
- 修改 `tauri-ui/src/pages/Dashboard.tsx`，运行面板的跳过原因和发送状态不再使用不相关岗位的最近事件。

### 原因
用户发现 `AI应用研究员（实习生）` 明明命中“实习”，但 GUI 仍显示“未命中实习”。排查日志后确认该岗位实际已匹配并发送，问题是运行面板把上一条岗位的跳过原因显示到了当前岗位。

### 影响范围
- 影响 GUI 运行面板展示逻辑。
- 不改变后端匹配和发送行为。

## 2026-07-01 13:22 - 支持手动筛选当前页面抓取

### 变更内容
- 修改 `src/boss_zhipin/tauri/__init__.py`，新增 `open_manual_browser` IPC，只打开或激活受控 Chrome，不开始抓取。
- 修改 `tauri-ui/src/lib/ipc.ts`、`tauri-ui/src/lib/i18n.ts`、`tauri-ui/src/pages/Dashboard.tsx`，新增“打开 BOSS 页面手动筛选”按钮，点击后自动启用“使用当前 BOSS 页面继续抓取”。
- 修改 `src/boss_zhipin/website_oper/write_response.py`，当前页面模式下跳过起始 URL 跳转、页面筛选点击和岗位标签选择，保留用户在 BOSS 网页端手动筛选的页面。
- 修改 `src/boss_zhipin/website_oper/finding_jobs.py`，补充 `RECOMMEND_URL` 常量，避免标签选择判断引用不存在的常量。
- 修改 `tests/test_scan_only.py`、`tests/test_tauri_ipc_contract.py`、`tauri-ui/src/lib/i18n.test.ts`，覆盖当前页面模式、列表加载边界和 GUI IPC 文案。

### 原因
用户反馈 BOSS 起始页 URL 会被平台定位或推荐流覆盖，希望改为在网页端手动筛选到正确页面后，工具直接从当前页面继续爬取。

### 影响范围
- 影响 GUI 主流程、Tauri IPC 和岗位扫描入口。
- 当前页面模式不会再自动点击页面筛选；本地岗位规则仍照常过滤。
- 修复第 20 条后短暂加载不到下一条时误跳过索引并提前结束的问题。
