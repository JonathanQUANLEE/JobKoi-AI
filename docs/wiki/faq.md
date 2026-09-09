# FAQ

## 使用

### 这个工具会不会有账号风险？

有。它会用浏览器自动化访问 BOSS，可能违反平台服务条款，也可能触发限流或风控。请先用 `scan` 和 `review`，不要高频群发。

### 为什么 0.2 不再生成招呼语？

为了可控和可解释。0.2 只发送用户自己填写的固定招呼语，不再读取简历、不调用 AI、不维护 provider 配置。这样用户能明确知道每次发送了什么。

### `scan` / `review` / `auto` 有什么区别？

| 模式 | 行为 |
|---|---|
| `scan` | 只扫描和记录命中岗位，不发送 |
| `review` | 命中后展示岗位详情和招呼语，你确认后发送 |
| `auto` | 命中后按随机等待节奏自动发送固定招呼语 |

### 怎么避免每次都掉回本地城市？

在 BOSS 网页里手动选好城市和岗位，把地址栏 URL 复制到 GUI 的 `BOSS 起始页 URL`，或写入：

```bash
BOSS_START_URL=https://www.zhipin.com/web/geek/jobs?city=101280600&query=后端开发
```

### 自动发送怎么筛岗位？

默认只看岗位名称：

- 必须包含：`实习`
- 方向关键词命中任一：`后端开发`、`ai`

GUI 可以直接改这两个输入框。CLI/profile 用户可以改：

```bash
BOSS_AUTO_TITLE_REQUIRED_TERMS=实习
BOSS_AUTO_TITLE_KEYWORDS=后端开发,ai
```

或修改 `profiles/*.yml`。

### 支持正则吗？

支持，profile 规则里把 `match` 设成 `regex`：

```yaml
filters:
  title:
    any:
      enabled: true
      scope: title
      match: regex
      keywords:
        - "(?i)ai|大模型|LLM|RAG"
```

### 页面筛选失败怎么办？

默认 `strict: false`，页面筛选点不上时只记录 warning 并继续，本地规则继续兜底。需要页面筛选失败就停止时，改成：

```yaml
page_filters:
  strict: true
```

### 怎么控制发送速度？

设置随机等待范围和上限：

```bash
BOSS_AUTO_SEND_DELAY_MIN=10
BOSS_AUTO_SEND_DELAY_MAX=60
BOSS_AUTO_SEND_MAX_SENT=50
BOSS_AUTO_SEND_DAILY_LIMIT=80
```

### 招呼语在哪里改？

GUI 里直接编辑固定招呼语。CLI profile 默认读取：

```text
greetings/default.txt
```

也可以在 profile 中改：

```yaml
send:
  greeting_file: ./greetings/default.txt
```

### 发送后跳到聊天页怎么办？

流程会尝试返回岗位列表。如果 BOSS 弹出“留在此页”，会自动点击后继续。

### 想只测试不真实发送怎么办？

GUI 勾选 `Dry-run 测试，不真实发送`，或设置：

```bash
DRY_RUN=1
```

## 开发

### 怎么验证改动？

```bash
uv run pytest -q
pnpm --dir tauri-ui build
```

### 修改规则应该看哪些文件？

- `src/boss_zhipin/config/filter_rules.py`
- `src/boss_zhipin/config/profiles.py`
- `profiles/*.yml`
- `tests/test_filter_rules.py`
- `tests/test_profiles_config.py`

### 修改 GUI 应该看哪些文件？

- `tauri-ui/src/pages/Dashboard.tsx`
- `tauri-ui/src/lib/ipc.ts`
- `src/boss_zhipin/tauri/__init__.py`

### 为什么保留 CLI？

CLI 适合高级用户、自动化测试和复现问题。GUI 是主入口，但不应该复制一套业务逻辑；GUI 和 CLI 都走同一个后端主循环。
