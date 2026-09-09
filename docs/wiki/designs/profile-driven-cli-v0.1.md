# Profile 驱动 CLI v0.1 设计

- **状态**：设计定稿
- **日期**：2026-06-29
- **目标仓库**：`4evour/Bosszhipin-job-bot`

## 项目定位

`Bosszhipin-job-bot` 是面向个人求职的 BOSS 岗位筛选与沟通 CLI 工具。用户通过
profile 配置岗位来源、页面筛选、本地匹配规则、招呼语和发送节奏；工具负责打开
BOSS、尝试页面筛选、滚动加载岗位、结构化提取岗位、按规则匹配、节流发送和落盘审计。

本项目不是“自动海投器”。默认允许自动发送，但必须有发送上限、随机等待、去重、
异常暂停和完整日志，避免误投和高频触发平台风控。

## v0.1 范围

- 多 profile 配置。
- profile 支持继承。
- 筛选规则使用显式 `enabled: true/false`。
- 匹配方式支持 `contains`、`regex`、`exact`。
- 默认匹配作用域为 `title`。
- 页面筛选组件自动点击：城市、学历、BOSS 活跃状态等。
- 页面筛选失败只记录 warning，继续运行，由本地规则兜底。
- 用户通过 `greeting_file` 指定招呼语文件。
- 默认发送模式为 `auto`。
- 随机等待范围、单次发送上限、每日发送上限可配置。
- 自动滚动加载更多岗位。
- 岗位去重，避免重复沟通。
- 记录发送、跳过、匹配原因日志。
- 代码注释使用中文，只注释复杂逻辑和关键约束。

## 暂不做

- Web UI。
- 桌面 App。
- AI 生成招呼语。
- 多账号。
- 绕过验证码。
- 破解或规避平台风控。

## 配置目录

```text
profiles/
  base.yml
  backend-intern.yml
  ai-intern.yml
  guangzhou-backend.yml
  shenzhen-ai.yml

greetings/
  default.txt
  backend.txt
  ai.txt
```

启动命令：

```bash
uv run main.py --profile backend-intern
```

## Profile 继承

每个 profile 可以通过 `extends` 继承另一个 profile。

```yaml
extends: base.yml
```

继承规则：

- 子 profile 覆盖父 profile 的同名字段。
- dict 递归合并。
- list 整体替换，不做自动追加。
- 支持多级继承。
- 必须检测循环继承，发现循环时直接报错。
- 启动时打印最终合并后的配置摘要。

list 采用整体替换是为了避免父级关键词“偷偷混进来”。例如 `backend-intern.yml`
显式写了 `title.any.keywords` 后，就应完全控制自己的方向关键词。

## 示例配置

```yaml
extends: base.yml

search:
  query: 后端开发实习

page_filters:
  strict: false

  city:
    enabled: true
    values:
      - 深圳
      - 广州

  education:
    enabled: true
    values:
      - 本科

  boss_active:
    enabled: true
    values:
      - 刚刚活跃
      - 今日活跃
      - 3日内活跃

filters:
  title:
    required:
      enabled: true
      scope: title
      match: contains
      case_sensitive: false
      keywords:
        - 实习

    any:
      enabled: true
      scope: title
      match: regex
      case_sensitive: false
      keywords:
        - 后端开发
        - ai

    exclude:
      enabled: true
      scope: title
      match: contains
      case_sensitive: false
      keywords:
        - 销售
        - 客服
        - 培训

  location:
    any:
      enabled: true
      scope: all
      match: contains
      case_sensitive: false
      keywords:
        - 深圳
        - 广州

send:
  mode: auto
  greeting_file: ./greetings/default.txt
  delay_min: 10
  delay_max: 60
  max_sent: 50
  daily_sent_limit: 80
  stop_on_captcha: true

state:
  seen_jobs_file: ./logs/seen_jobs.jsonl
  sent_log_file: ./logs/sent_jobs.jsonl
  skipped_log_file: ./logs/skipped_jobs.jsonl
```

## 规则模型

每个规则组固定包含：

- `enabled`：是否启用。
- `scope`：匹配作用域，默认 `title`。
- `match`：匹配方式，默认 `contains`。
- `case_sensitive`：是否大小写敏感，默认 `false`。
- `keywords`：关键词或正则列表。

支持的 `scope`：

| scope | 含义 |
|---|---|
| `title` | 岗位标题 |
| `description` | JD 正文 |
| `company` | 公司名 |
| `boss` | BOSS 名称与活跃状态 |
| `location` | 工作城市/地址 |
| `all` | 将结构化字段合并后匹配 |

支持的 `match`：

| match | 行为 |
|---|---|
| `contains` | 普通包含 |
| `regex` | 正则匹配 |
| `exact` | 完全相等 |

匹配顺序：

1. 先执行 `exclude`。命中黑名单直接跳过。
2. 再执行 `required`。所有关键词都必须命中。
3. 最后执行 `any`。至少命中一个关键词。

这样可以避免黑名单岗位因为同时命中正向关键词而被误发送。

## 页面筛选

页面筛选在打开搜索页后、本地岗位匹配前执行。

执行顺序：

```text
打开 BOSS 搜索页
  -> 选择城市
  -> 选择学历
  -> 选择 BOSS 活跃状态
  -> 选择经验/薪资/公司规模等扩展筛选
  -> 等待岗位列表刷新
```

`page_filters.strict` 默认为 `false`：

- 筛选点击成功：继续处理岗位。
- 筛选点击失败：记录 warning，继续处理岗位。
- 本地 `filters` 继续兜底，防止页面筛选没点上导致误投。

如果用户后续设置 `strict: true`，任一启用的页面筛选失败都应停止运行。

## 岗位结构

浏览器层应输出结构化岗位对象，而不是只返回 JD 字符串。

```python
JobPosting(
    title: str,
    company: str,
    location: str,
    salary: str,
    tags: list[str],
    boss_name: str,
    boss_active_status: str,
    education: str,
    description: str,
    detail_url: str,
)
```

本地匹配、去重、日志都基于 `JobPosting`。

## 自动加载更多

BOSS 当前列表更接近滚动加载，不应假设有稳定的“下一页”按钮。

流程：

```text
处理当前已加载岗位
  -> 滚动到底部
  -> 等待 `.job-card-box` 总数增加
  -> 如果增加，继续处理新增岗位
  -> 如果连续 N 次不增加，判定到底
```

必须配合岗位去重，避免滚动后旧卡片重新进入处理队列。

默认去重 key：

```text
title + company + location + boss_name
```

如果后续能稳定拿到详情 URL，可优先使用详情 URL。

## 发送模式

`send.mode` 支持：

| mode | 行为 |
|---|---|
| `scan` | 只扫描和记录，不发送 |
| `review` | 命中后展示岗位和招呼语，用户确认后发送 |
| `auto` | 命中后直接发送 |

默认 `auto`，但必须同时执行：

- `max_sent`：单次运行发送上限。
- `daily_sent_limit`：每日发送上限。
- `delay_min` / `delay_max`：发送后随机等待。
- `seen_jobs_file`：跳过已处理岗位。
- `stop_on_captcha`：遇到验证码或登录异常时停止。

## 日志

建议拆分三类 JSONL：

| 文件 | 内容 |
|---|---|
| `sent_jobs.jsonl` | 已发送岗位、招呼语、匹配原因 |
| `skipped_jobs.jsonl` | 跳过岗位、跳过原因 |
| `seen_jobs.jsonl` | 已处理岗位 key，用于去重 |

每条日志至少包含：

- 时间。
- profile 名称。
- job key。
- 岗位结构化信息。
- 匹配结果。
- 发送模式。
- 是否真实发送。

## 实施顺序

1. 新增配置加载与 profile 继承。
2. 新增规则模型与匹配器。
3. 将岗位提取升级为完整 `JobPosting`。
4. 接入招呼语文件与发送配置。
5. 接入页面筛选点击，失败 warning 后继续。
6. 实现滚动加载更多与去重。
7. 替换旧环境变量驱动入口，保留兼容层。
8. 补充文档、示例 profile 和测试。

