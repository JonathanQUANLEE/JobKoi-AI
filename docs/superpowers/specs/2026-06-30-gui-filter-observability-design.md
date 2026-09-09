# GUI filter observability v0.3 design

## 状态

- 日期：2026-06-30
- 状态：待用户 review
- 范围：设计，不包含实现

## 背景

v0.2 GUI 已能保存 profile、固定招呼语、页面筛选、运行模式和发送节奏。但真实运行时暴露出几个问题：

- 页面筛选失败不够可见，用户不知道是城市、学历、BOSS 活跃状态哪一项没有点上。
- `BOSS 起始页 URL` 虽然已保存到 profile，但用户无法确认浏览器实际打开后是否被 BOSS 按定位或账号偏好重定向。
- GUI 混用英文枚举，例如 `contains`、`regex`、`exact`、`title`，非技术用户难理解。
- 运行日志缺少时间戳，也没有用中文解释岗位为什么通过或跳过。
- 岗位规则需要明确支持“只看岗位名称”和“岗位名称 + 正文一起看”的选择。

## 目标

1. GUI 彻底支持中文和英文两套界面文案。
2. 运行日志和 JSONL 日志都带本机时间戳。
3. 岗位筛选日志用中文解释每一步为什么通过或不通过。
4. 匹配范围补齐“只检索岗位名称”和“岗位名称 + 正文一起检索”。
5. 页面筛选失败默认继续运行，但必须详细报错，并提示用户可以手动筛选页面后继续。
6. 起始 URL 要能被真实使用，并在实际打开 URL 与用户填写 URL 不一致时明确提示。

## 非目标

- 不重新引入 LLM、RAG、简历解析或 provider 配置。
- 不绕过 BOSS 验证码、安全验证或平台风控。
- 不保证 BOSS 页面筛选控件永远可自动点击；BOSS DOM 变化时允许降级到手动筛选。
- 不改变 profile YAML 的内部枚举值，仍用英文稳定值保存配置。

## GUI 双语

GUI 增加完整文案字典，所有面向用户的标签、按钮、提示、日志解释都走 i18n。

中文显示：

| 内部值 | 中文文案 |
|---|---|
| `contains` | 包含关键词 |
| `regex` | 正则匹配 |
| `exact` | 完全等于 |
| `title` | 只看岗位名称 |
| `description` | 只看岗位正文 |
| `title_description` | 岗位名称 + 正文 |
| `all` | 全部字段 |

英文显示：

| 内部值 | English label |
|---|---|
| `contains` | Contains |
| `regex` | Regular expression |
| `exact` | Exact match |
| `title` | Job title only |
| `description` | Job description only |
| `title_description` | Title + description |
| `all` | All fields |

保存到 YAML 时仍写内部值，避免破坏 CLI 和已有 profile。

## 岗位规则

GUI 的“匹配范围”改成明确的用户选择：

- 只看岗位名称：只用岗位卡标题判断，默认推荐。
- 只看岗位正文：只用 JD 正文判断，适合用户明确想按职责描述筛选。
- 岗位名称 + 正文：标题和正文拼接后匹配，命中范围更宽，但噪声也更大。
- 全部字段：标题、公司、地点、薪资、标签、BOSS 状态、学历、正文一起匹配，作为高级选项。

后端增加内部 scope `title_description`，只拼接 `title` 和 `description`。这样不会把公司名、地点、薪资等字段混进“名称 + 正文”。

## 中文解释日志

GUI 运行日志每行前置本机时间戳：

```text
2026-06-30 16:45:12 正在检查第 8 个岗位：后端开发实习生 / 深圳 / 本科
2026-06-30 16:45:12 匹配范围：只看岗位名称
2026-06-30 16:45:12 必须包含关键词：已命中「实习」
2026-06-30 16:45:12 任一命中关键词：未命中「后端开发 / AI / RAG」
2026-06-30 16:45:12 跳过原因：岗位名称缺少方向关键词
```

每个岗位至少记录：

- 当前岗位序号。
- 岗位名称、公司、地点、学历、薪资。
- 当前匹配范围。
- 排除关键词是否命中。
- 必需关键词命中和缺失情况。
- 任一关键词命中和缺失情况。
- 最终结果：跳过、扫描命中、等待审核、dry-run、已发送。

成功发送也要解释原因：

```text
2026-06-30 16:46:03 通过原因：岗位名称命中必须关键词「实习」，并命中方向关键词「AI」
2026-06-30 16:46:03 已发送固定招呼语，下一次等待 37.2 秒
```

## JSONL 日志

`seen_jobs.jsonl`、`sent_jobs.jsonl`、`skipped_jobs.jsonl` 增加本机时间字段：

- `ts`：保留现有 ISO 时间，继续给机器统计使用。
- `ts_local`：本机可读时间，格式 `YYYY-MM-DD HH:mm:ss`。

跳过和发送记录的 `match` 字段补充结构化解释：

```json
{
  "scope": "title",
  "scope_label": "只看岗位名称",
  "required": {
    "keywords": ["实习"],
    "matched": ["实习"],
    "missing": []
  },
  "any": {
    "keywords": ["后端开发", "AI", "RAG"],
    "matched": ["AI"],
    "missing": ["后端开发", "RAG"]
  },
  "exclude": {
    "keywords": ["销售"],
    "matched": []
  },
  "explanation": "岗位名称命中必须关键词「实习」，并命中方向关键词「AI」"
}
```

## 页面筛选

页面筛选仍保留 profile 配置：

- 城市。
- 学历。
- BOSS 活跃状态。

执行策略：

1. 打开起始页。
2. 记录用户填写的起始 URL。
3. 等页面稳定后记录实际 URL。
4. 如果实际 URL 与用户填写 URL 不一致，发出中文 warning。
5. 逐项点击页面筛选。
6. 每项都记录尝试、成功、失败原因。
7. 失败默认继续运行，本地规则兜底。

失败日志示例：

```text
2026-06-30 16:48:20 页面筛选：尝试点击 城市=深圳
2026-06-30 16:48:21 页面筛选失败：找不到「深圳」筛选项。已继续运行，本地规则继续兜底。
2026-06-30 16:48:21 建议：你可以在 BOSS 页面手动筛选到目标城市，然后把当前页面 URL 粘到 GUI 的 BOSS 起始页 URL。
```

页面筛选失败策略默认是继续运行。GUI 文案明确写成：

```text
警告后继续，本地规则兜底
```

## 起始 URL 和手动筛选

GUI 增强 `BOSS 起始页 URL` 的可见性：

- 运行前展示当前 profile 保存的 URL。
- 启动后展示浏览器实际打开后的 URL。
- 如果不一致，显示中文 warning。

新增一个运行选项：

```text
使用当前 BOSS 页面继续抓取
```

该选项用于用户已经在浏览器中手动筛选城市、岗位、学历或活跃状态的场景。选中后：

- 不再打开新的 start URL。
- 复用当前受控 Chrome tab。
- 直接从当前页面执行岗位列表抓取和本地规则筛选。

如果当前没有受控 tab，GUI 提示用户先启动一次浏览器或填写起始 URL。

## 后端接口

最小新增 IPC：

- `get_browser_page_state`：返回当前受控 tab 的 URL、标题、已加载岗位数量。

`start_run` 的 `RunConfig` 增加：

- `use_current_page: bool = false`

现有 IPC 不需要恢复旧诊断、历史页或更新检查。

## 数据流

```text
GUI profile form
  -> profile YAML
  -> start_run(config)
  -> apply_profile_to_env
  -> open start_url 或复用当前 tab
  -> page filter runner
  -> local matcher
  -> structured explanation
  -> GUI timestamped logs + JSONL
```

## 测试策略

补充测试：

- GUI i18n：中文和英文都能显示匹配方式、匹配范围、页面筛选失败策略。
- profile 表单：`title_description` 能保存到 YAML。
- matcher：`title_description` 只拼接标题和正文，不包含公司和地点。
- matcher explanation：通过、必需缺失、任一缺失、排除命中都有中文解释。
- URL 状态：start URL 与实际 URL 不一致时产生 warning 事件或日志。
- 页面筛选：每项点击成功、失败继续、失败详细原因。
- JSONL：`ts_local` 存在且格式为 `YYYY-MM-DD HH:mm:ss`。
- GUI run state：运行面板能展示当前 URL、实际 URL 和页面筛选结果。

## 验收标准

- 非技术用户在中文 GUI 中不再看到必须理解的英文枚举。
- 用户能从运行日志直接看出一个岗位为什么被跳过或为什么发送。
- 用户能从运行面板看出页面筛选是否成功，以及 BOSS 是否重定向了起始 URL。
- 页面筛选失败不会阻断运行，但会给出可执行的手动处理建议。
- 用户可以手动筛选到目标页面，再让工具从当前页面继续抓取和筛选。
