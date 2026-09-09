# 常见故障排查

## 1. Chrome 起来后不是我的日常浏览器

这是设计。项目默认使用独立 profile：

```text
./chrome_profile/
```

这样不会影响你日常 Chrome 的 cookie、扩展和浏览记录。第一次需要扫码登录 BOSS，之后登录态会保存在这个目录。

## 2. 卡在登录页

先确认你是否在脚本打开的独立 Chrome 里完成过扫码登录。可以删除 profile 后重新来一次：

```bash
rm -rf chrome_profile/
uv run python -m boss_zhipin.tauri
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force .\chrome_profile\
uv run python -m boss_zhipin.tauri
```

## 3. BOSS 一打开就是本地城市

BOSS 会按账号、IP 或历史偏好给推荐页。解决办法是把手动筛好的页面 URL 固定下来：

1. 在 BOSS 网页里选城市、岗位、学历等筛选。
2. 复制地址栏 URL。
3. 填到 GUI 的 `BOSS 起始页 URL`。

CLI 用户写入：

```bash
BOSS_START_URL=https://www.zhipin.com/web/geek/jobs?city=101280600&query=后端开发
```

## 4. 一个岗位都不匹配

先检查当前模式和规则。

自动发送默认只看岗位名称，不看详情正文：

```bash
BOSS_AUTO_TITLE_REQUIRED_TERMS=实习
BOSS_AUTO_TITLE_KEYWORDS=后端开发,ai
```

如果岗位标题是“Java开发实习生”，但你的方向关键词只有“后端开发”，就不会命中。可以把方向关键词改成：

```bash
BOSS_AUTO_TITLE_KEYWORDS=后端开发,Java,Go,服务端,ai
```

如果使用 profile，检查 `filters.title.required` 和 `filters.title.any`。

## 5. 页面筛选点不上

BOSS 页面控件经常变化。默认配置是：

```yaml
page_filters:
  strict: false
```

这表示页面筛选失败只 warning，继续用本地规则兜底。如果你设置了 `strict: true`，页面筛选失败会停止。

## 6. 发送太快，担心限流

调大随机等待范围，并降低上限：

```bash
BOSS_AUTO_SEND_DELAY_MIN=30
BOSS_AUTO_SEND_DELAY_MAX=120
BOSS_AUTO_SEND_MAX_SENT=20
BOSS_AUTO_SEND_DAILY_LIMIT=40
```

## 7. 检测到验证码或安全验证

默认 `BOSS_STOP_ON_CAPTCHA=1`。看到验证码时工具会停止，不会尝试绕过平台验证。请手动处理账号状态，稍后再低频运行。

## 8. 发送后停在聊天页

当前流程会尝试返回岗位列表。如果 BOSS 弹出“留在此页”，会自动点击。若仍停住，请保存运行日志和当时页面状态，再检查 `finding_jobs.return_to_job_list` 相关逻辑。

## 9. 想彻底重置状态

谨慎执行，会删除登录态和本地日志。

macOS / Linux：

```bash
rm -rf chrome_profile/
rm -rf logs/
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force .\chrome_profile\
Remove-Item -Recurse -Force .\logs\
```

## 10. GUI 启动失败

先跑后端测试和前端构建：

```bash
uv run pytest -q
pnpm --dir tauri-ui build
```

如果前端构建提示 esbuild build script 被拦截，确认 `tauri-ui/pnpm-workspace.yaml` 中允许了 `esbuild`。

## 11. 还是不行

反馈时请附：

1. 你使用的是 GUI 还是 CLI。
2. 当前模式：`scan` / `review` / `auto`。
3. 控制台或 GUI 日志。
4. `.env` 里有哪些 key，不要贴任何敏感值。
5. Chrome 版本、系统版本、Python 和 uv 版本。
