# JobKoi-AI 发布与自动更新 SOP（Agent 执行手册）

> 目标读者：任何接手发版任务的 AI Agent / 开发者。读完即可独立完成
> 「代码 → 安装包 → GitHub Release → 全体用户自动收到更新」全流程。
> 最后验证于 2026-10-19（v0.7.0 发布实战 + mock E2E 真机全链路验证）。

## 0. 架构总览

```
代码合入 main
   │
   ├─ 通道 A（首选）：git tag vX.Y.Z → push → GitHub Actions 全自动
   │   签名构建 → NSIS 重命名 ASCII → 生成 latest.json → draft Release → 人工 Publish
   │
   └─ 通道 B（应急）：本地 build_standalone.ps1 → 手动上传 GitHub Release
   │
   ▼
GitHub Release（tag vX.Y.Z，含 4 个资产：Setup.exe / .sig / .msi / latest.json）
   │
   ▼
用户端 tauri-plugin-updater 启动 3s 后静默查
https://github.com/JonathanQUANLEE/JobKoi-AI/releases/latest/download/latest.json
   → 有新版本 → 弹窗 → 下载 → 校验 minisign 签名 → NSIS 静默安装 → 自动重启
```

## 1. 一次性基础设施（已就绪，勿重建勿修改）

| 设施 | 位置 / 说明 |
|---|---|
| 更新签名密钥对 | `%USERPROFILE%\.tauri\jobkoi-updater.key`（私钥）+ `.key.pub`（公钥）+ `.key.pass`（密码）。**私钥绝不进仓库 / 项目 .env**（sanitize 会把 .env 重置成模板，等于销毁私钥） |
| GitHub Secrets | `TAURI_SIGNING_PRIVATE_KEY`（私钥全文）+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（已配置） |
| CI 发布链 | `.github/workflows/release.yml`（tag `v*` 触发） |
| 客户端 updater | `src-tauri/tauri.conf.json` 的 `plugins.updater`（pubkey / endpoints / installMode=passive） |
| Rust 侧插件 | Cargo.toml：`tauri-plugin-updater` / `tauri-plugin-process` 直接依赖（ACL links 硬要求） |
| Python 侧注册 | `src/boss_zhipin/tauri/__init__.py` 的 `_updater_plugins()`——注意 `Builder.build()` 是 **staticmethod，不能实例化** |
| 前端 | `tauri-ui/src/lib/updater.ts` + `updateSlice` + `UpdateDialog` + `useUpdateChecker` + `AboutTab` |

**两条铁律：**
1. **双模式镜像**：`tauri.conf.json` 与 `src/boss_zhipin/tauri/Tauri.toml` 的 `plugins.updater` 三项（pubkey/endpoints/installMode）必须逐字一致——`tests/test_standalone_sync.py` 守卫，改一份必须同步另一份。
2. **版本锁**：`tauri = "=2.11.2"`（pytauri 0.8 兼容上限，升级 pytauri >0.8 才能放开）；npm 插件必须与 Cargo.lock 解析版本同 minor（当前 `@tauri-apps/plugin-updater@2.12.0` / `plugin-process@2.3.1`——tauri CLI 强校验，错位构建直接失败）。

## 2. 发版第一步：版本号同步（共 7 处）

```powershell
# 自动管 5 处（pyproject.toml / Cargo.toml / tauri.conf.json / Tauri.toml / Cargo.lock）
uv run python scripts/set_version.py 0.8.0
```

手动 2 处：
- `tauri-ui/package.json` 的 `version`
- `tauri-ui/src/lib/storageSanitizer.ts` 的 `CURRENT_STORAGE_VERSION`（有 vitest 版本守卫测试，忘改会红）

## 3. 发版门禁（全绿才许继续）

```powershell
uv run pytest tests/ -q                    # 全量（当前 590+）
pnpm --dir tauri-ui exec tsc               # 类型检查
pnpm --dir tauri-ui test                   # vitest 全量（含版本守卫）
uv run python scripts/sanitize_for_release.py --check
```

## 4. 通道 A：CI 全自动（GitHub 账单解锁后首选）

```powershell
git tag v0.8.0
git push origin v0.8.0
```

Actions 自动执行（约 15-30 min）：双平台签名构建 → Windows 安装包重命名 ASCII → `make_latest_json.py` 生成 latest.json → **draft Release**（人工审查后点 Publish，防错版本公开）。

**当前状态（2026-10-19）**：GitHub 账户被 billing 锁拦截（"account is locked due to a billing issue"，Run #6/#7 均未启动即失败）。解锁前用通道 B；解锁后建议先打 `v0.8.0-rc1` 演练验证流水线。

## 5. 通道 B：本地应急链（当前主用，v0.7.0 实战验证）

### 5.1 构建

```powershell
$env:Path = "C:\Users\14905\AppData\Roaming\npm;B:\nodejs;$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.local\bin;" + $env:Path
& "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File scripts\build_standalone.ps1
```

脚本自动装载签名私钥（4.5 段）。产物在 `src-tauri\target\bundle-release\bundle\`：
- `nsis\*-setup.exe` + 同名 `.sig`（自动更新走这对）
- `msi\*.msi`

### 5.2 暂存 + ASCII 重命名（latest.json 的 url 与资产名必须逐字符一致）

```powershell
# NSIS 必须 ASCII（GitHub 资产 URL 含中文会 percent-encode 不可控）；MSI 保持原名
Copy-Item "<nsis>\JobKoi-AI · 全智能求职锦鲤助手_0.8.0_x64-setup.exe" "<暂存>\JobKoi-AI-Setup-0.8.0-x64.exe"
Copy-Item "<nsis>\JobKoi-AI · 全智能求职锦鲤助手_0.8.0_x64-setup.exe.sig" "<暂存>\JobKoi-AI-Setup-0.8.0-x64.exe.sig"
Copy-Item "<msi>\JobKoi-AI · 全智能求职锦鲤助手_0.8.0_x64_zh-CN.msi" "<暂存>\"
```

### 5.3 生成 latest.json

```powershell
uv run python scripts\make_latest_json.py `
  --version 0.8.0 `
  --sig "<暂存>\JobKoi-AI-Setup-0.8.0-x64.exe.sig" `
  --url "https://github.com/JonathanQUANLEE/JobKoi-AI/releases/download/v0.8.0/JobKoi-AI-Setup-0.8.0-x64.exe" `
  --out "<暂存>\latest.json" --notes "更新说明"
```

### 5.4 打 tag（latest.json 的 url 与 releases/latest 端点都依赖 tag 名）

```powershell
git tag v0.8.0
git push origin v0.8.0
```

### 5.5 GitHub 网页发布

`Releases → Draft a new release → 选已有 tag v0.8.0 → 上传 4 个文件（exe / .sig / msi / latest.json）→ Save draft 核对资产名 → Set as the latest release → Publish`

### 5.6 归档与验证（必做）

```powershell
# 归档到发布专区（目录结构与历史版本一致）
Copy-Item "<暂存>\*" "B:\JobHunter-发布专区\安装包\v0.8.0\"
```

验证三项：
1. `https://github.com/JonathanQUANLEE/JobKoi-AI/releases/latest/download/latest.json` → HTTP 200 且 version/url/signature 正确
2. latest.json 里的安装包直链 → HTTP 200
3. 已安装客户端「系统设置 → 关于与帮助 → 检查更新」→「当前已是最新版本」（若客户端是旧版本，应弹更新弹窗）

## 6. 红线（违者回滚重做）

1. **私钥/密码绝不进仓库、项目 .env、代码**——只放 `%USERPROFILE%\.tauri\` 或 GitHub Secrets。
2. `sanitize --sanitize` 发布后必须 `--restore` 并逐项核对用户私有数据（.env / agent_config.json / profiles / greetings / logs / resume）。
3. **严禁在 sanitize 脚本里删打包机 AppData**——`%APPDATA%\com.jonathanquanlee.jobkoi-ai`（Roaming）是用户画像与投递记录；本机同时是打包机与开发者日常用机。要"新用户视角"自测就设 `BOSS_APP_DATA_DIR` 指向临时目录（`boss_zhipin.paths` 原生支持）。
4. **卸载钩子只清 `%LOCALAPPDATA%`（WebView2 缓存），保留 Roaming 用户数据**（`src-tauri/windows/hooks.nsh`，改动前先读注释）。
5. **localStorage 版本隔离不得清空管家对话历史、不得拦截开发者本人登录**（见 `storageSanitizer.ts` 头注释的设计边界）。
6. latest.json 的 url 文件名必须与上传资产**逐字符一致**（ASCII）。
7. 先 draft 核对再 Publish，防错版本公开。
8. 升级安装（自动更新）不走卸载钩子，用户数据无虞。

## 7. 老用户边界

- v0.6.x 及更早版本：**无**软件内自动更新（需手动下载新版安装）。
- MSI 通道用户：无自动更新（updater 只走 NSIS）。
- v0.7.0 起的 NSIS 用户：全自动更新。
