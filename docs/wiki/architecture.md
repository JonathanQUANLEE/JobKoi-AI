# 架构总览

## 一句话

GUI 或 CLI 启动运行 → 打开 BOSS → 抓取岗位 → 本地规则筛选 → 扫描、审核或发送固定招呼语 → 写入 JSONL 日志。

0.2 起，本项目不再包含 LLM、简历解析、RAG、向量库或 provider 路由。

## 数据流

```text
GUI Dashboard / CLI profile
        │
        ▼
boss_zhipin.cli.run_automation
        │
        ▼
website_oper.write_response.send_job_descriptions_to_chat
        │
        ├─ finding_jobs：Chrome / BOSS 页面自动化
        ├─ config.filter_rules：本地规则匹配
        ├─ audit.validate_letter：固定招呼语兜底校验
        ├─ gui.events：向 GUI 回传进度事件
        └─ JSONL logs：seen / sent / skipped / letters
```

## 模块边界

| 模块 | 职责 | 不该做的事 |
|---|---|---|
| `cli.py` | 解析 CLI 参数、加载 profile、桥接环境变量、启动主循环 | 操作 DOM、发送消息 |
| `config/profiles.py` | 加载和合并 YAML profile | 理解 BOSS 页面 |
| `config/filter_rules.py` | 对结构化岗位做本地规则匹配 | 读写浏览器或日志 |
| `website_oper/finding_jobs.py` | BOSS 页面自动化、登录、抓岗位、点击和发送 | 决定岗位是否匹配 |
| `website_oper/write_response.py` | 主循环、运行模式、节流、日志、调用发送 | 生成招呼语 |
| `audit/__init__.py` | 固定招呼语长度、中文和黑名单校验，写审计日志 | 访问 BOSS |
| `tauri/` | PyTauri IPC、运行任务、日志和事件通道 | 复制业务逻辑 |
| `tauri-ui/` | 单页 GUI 工作台 | 绕过后端直接跑浏览器 |

## Profile 规则

profile 是 CLI 的主要配置方式，也给 GUI 后续可视化 profile 编辑留边界。

```yaml
filters:
  title:
    required:
      scope: title
      match: contains
      keywords: [实习]
    any:
      scope: title
      match: regex
      keywords: [后端开发, "(?i)ai"]
```

匹配顺序：

1. `exclude`
2. `required`
3. `any`

`match` 支持 `contains`、`regex`、`exact`。默认推荐 `scope: title`，避免岗位详情中的页面噪声影响结果。

## 运行模式

| 模式 | 入口配置 | 行为 |
|---|---|---|
| `scan` | `BOSS_SCAN_ONLY=1` | 只记录命中岗位 |
| `review` | `BOSS_REVIEW_BEFORE_SEND=1` | 逐条展示岗位详情，用户确认后发送 |
| `auto` | `BOSS_AUTO_SEND_FIXED_GREETING=1` | 命中后发送固定招呼语，并按随机等待节流 |

未选择任何模式时，主循环直接报错，避免默认进入真实发送。

## 主循环

```python
open_browser_with_options(url, "chrome")
log_in()
apply_page_filters(page_filters)

while True:
    job = get_job_by_index(job_index)
    if job is None:
        scroll_or_stop()
        continue

    if already_seen(job):
        skip()
        continue

    match = match_posting(job, profile_filters)
    if not match.matched:
        log_skipped()
        continue

    if scan:
        log_scan_match()
    elif review:
        ask_user_then_send()
    elif auto:
        validate_fixed_greeting()
        send()
        sleep(random(delay_min, delay_max))
```

发送后如果 BOSS 跳到聊天页，流程会尝试返回岗位列表；如果出现“留在此页”弹窗，会点击留在此页继续。

## 落盘文件

| 文件 | 内容 |
|---|---|
| `chrome_profile/` | 独立 Chrome profile 和登录 cookie |
| `logs/scan_matches.jsonl` | 扫描命中岗位 |
| `logs/seen_jobs.jsonl` | 已看过岗位 |
| `logs/sent_jobs.jsonl` | scan / dry-run / 已发送记录 |
| `logs/skipped_jobs.jsonl` | 跳过原因 |
| `logs/letters.jsonl` | 固定招呼语校验和发送审计 |

## 相关决策

- [ADR-001](adr/001-nodriver-over-selenium.md) —— 浏览器自动化选型
- [ADR-002](adr/002-three-providers.md) —— 旧 provider 设计，0.2 已废弃
- [ADR-004](adr/004-persistent-chrome-profile.md) —— 持久化 Chrome profile
- [ADR-005](adr/005-pytauri-standalone.md) —— PyTauri standalone
- [GUI v0.2 设计](designs/gui-v0.2.md) —— 0.2 收敛方向
