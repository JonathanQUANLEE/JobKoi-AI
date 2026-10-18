# 任务台账（将军 + 小兵作战）

> 恢复工作时：先读本台账 + git log，不凭记忆；已完成任务绝不重派。

## Task 1: complete (35ebbee, 后端 554 passed + tsc 0 错误)
- **目标**：修复两个用户实测 bug —— ① 详情页 JD 提取超时打死整轮巡航；② 验证码停机时浏览器被自动关闭、用户来不及验证。
- **产出**：
  - `src/boss_zhipin/website_oper/core/window_focus.py`（新增，140 行）：Win32 强制前置受控 Chrome 窗口
  - `src/boss_zhipin/gui/browser_retention.py`（新增，33 行）：验证码停机保留窗口登记
  - 修改 8 个文件：runner 收尾分支、BOSS 双流、猎聘、51job 四处验证码检出点、前端强提醒
  - `tests/test_captcha_alert.py`（新增，182 行，4 项测试）
- **验证**：`pytest tests/ -q` → 554 passed, 1 skipped；`tsc --noEmit` → 0 错误
- **状态**：已提交，**审查中**（soldier-reviewer 军事演练）

### Ruling 记录
- Ruling: 直接在 main 上改并提交，未开 worktree — 用户明确要求先 git 保存以防搞坏项目，恢复点 `7ed0566` 已存在；开 worktree 会增加用户操作负担 — 若改坏，`git reset --hard 7ed0566` 可完整回滚。
- Ruling: 验证码停机"保留浏览器窗口"而非"关闭后提示" — 用户明确要求窗口必须弹出且能让他完成验证，关闭则验证码一闪而过 — 若判断有误，窗口会残留占资源，但不影响账号安全（保号优先）。
- Ruling: `windown_focus` 用 Win32 ctypes 而非跨平台库 — 项目仅发布 Windows 客户端（v0.5.0 .exe/.msi），加跨平台依赖违背最小改动 — 若未来上 macOS，此模块需重写（已在代码中非 Windows 静默降级）。

## Task 2: complete (2026-10-18)
- **目标**：安装 GitHub skills 提升将军派单/小兵执行效率 + 军事演练。
- **产出**：`~/.claude/skills/` 安装 8 个 obra/superpowers skills：
  `subagent-driven-development` / `writing-plans` / `executing-plans` / `dispatching-parallel-agents` / `systematic-debugging` / `requesting-code-review` / `verification-before-completion` / `using-git-worktrees`
- **兵种改造**：4 个 soldier agent 从"网页设计兵"重写为对口兵种（architect/coder/reviewer/stylist）
- **演练**：soldier-reviewer 审查 35ebbee，发现 2 个严重 + 3 个中等 + 3 个轻微

## Task 3: in-progress (2026-10-18)
- **目标**：修复审查发现的【严重】问题。
- **审查裁定（将军）**：
  - 【严重1】window_focus.py `SetWindowPos` 的 HWND_TOPMOST 未声明 argtypes → 64 位下置顶失效（实测 GetLastError=1400），且假报成功。**裁定：必须改**（核心需求失效）。
  - 【严重2】runtime.py `_close_platform_browser` 不查 browser_retention → 猎聘/51job 验证码保留完全无效。**裁定：必须改**（核心需求失效）。
  - 【中等3】验证码保留后 `_browser` 存活，下一轮复用验证码页面。**裁定：必须改**（用户未验证就重启会再次被拦，但不会封号。改为复用前先 captcha_visible 探测，命中则 shutdown 重开）。
  - 【中等4】chat_action 内外层 wait_for 同值，内层永远先被外层截断，可能残留 Transaction。**裁定：必须改**（外层 timeout+1）。
  - 【中等5】测试盲区（window_focus 全 mock / 无多平台保留用例 / test_jd_timeout 空等 20s）。**裁定：改**（补多平台用例 + JD 超时测试缩短）。
  - 【轻微】窗口按标题过滤 / 通知代码重复 / monkeypatch 空操作。**裁定：改**（低风险，顺手做）。
## Task 4: complete (全系统 bug 普查，17 项确认，2026-10-18)
- **产出**：三路并行审查 + 客观扫描，17 项确认（7 严重 + 6 中等 + 4 轻微）
- **详情**：见上方各任务记录；用户裁定：#9 BOSS=150 改代码、#4 API Key 保留内置+发布声明、猎聘日限维持 50

## Task 5: in-progress (12+2 项 bug 修复，2026-10-18)
- **已修**：#1 搜索页超时收敛（job_api）/ #2 猎聘51job 日限全链路（5 文件）/ #3 platform 字段 / #4 发布声明 / #5 51job 成功回执记账 / #6 51job 封禁检测 / #7 saveConfig 顺序 / #8 env 漏清补齐 / #9 BOSS 150 / #10 公司名三层提取 / #11 熔断跨页累计 / #12 seen 落盘推迟+回滚 / #13 scan_only 上限 / #14 DOM 流高斯
- **验证**：561 passed + 1 skipped；tsc 0 错误；前端 113 passed
- **测试修正**：4 个断言随 BOSS 150 连带更新；test_review_send 的 uniform mock 迁移到 human_pause
- **状态**：soldier-reviewer 最终质检中

### Ruling 记录（Task 5）
- Ruling: 猎聘日限保持 50 — 用户只确认了 BOSS=150；猎聘沿用 10-15 封号复盘的保守值，UI 输入上限 100 不变 — 若用户想放开，画像/GUI 可覆盖。
- Ruling: #4 API Key 保留内置 — 用户拍板"薅羊毛给用户的，透露无所谓"；发布脚本加显式声明 — 若 Key 被滥用失效，改 ZHIPU_PUBLIC_API_KEY env 即可。
- Ruling: #12 seen 落盘推迟到详情页打开成功后 — 审查指出打开失败烧岗位；内存标记保留同轮防重 — filtered 路径的 _log_seen 一并推迟（行为统一）。
- Ruling: #5 51job 记账以成功弹窗为准 — dismiss 返回 none = 疑似未投，不记账不占去重 — 弹窗渲染 >1s 的极端慢机可能漏记（宁可漏记勿虚记）。
- **目标**：用户问"系统里有多少个 bug"。没有工具能给出这个数字，改为三路并行只读审查 + 客观门禁扫描。
- **客观扫描结果**：
  - TODO/FIXME/HACK 遗留：0（9 处匹配全是注释里的 xxx/applyTheme 等误报）
  - 裸 `except:`：0
  - 未设默认值的 `os.getenv`：0
  - `except Exception: pass` 静默吞异常：18 处（多为事件总线/日志桥接的合理兜底）
  - 疑似漏 await：6 处 → 逐个核查后确认**全是误报**（都是 `wait_for(...)` 的参数行）
- **派兵**：3 路 soldier-reviewer 并行（巡航核心 / 猎聘+51job+平台+AI 层 / 前端+IPC 层），各审各的文件域，无写权。

### 将军自查已确认的 bug（等待期发现，端到端核实）
- **【严重·语义不一致】猎聘/51job 单轮上限「0=不限」失效**
  - BOSS：`env_config._auto_send_max_sent()` 显式处理 `raw == "0"` → None（不限），有 `tests/test_run_max_semantics.py` 覆盖
  - 猎聘/51job：`platforms/limits.py:49` `env_run_max` 用 `int(raw) > 0` 判断，"0" 不满足 → 回退默认 15/10
  - 完整链路已核实：GUI `profileForm.ts:146-147` → profile YAML → `profile_env_bridge.py:49-50` → env → `env_run_max`
  - **后果**：用户在猎聘/51job 填 0 想"跑满日限"，实际只投 15/10 份就停——与用户拍板的语义相反，且无提示
  - **裁定：必须修**（与 BOSS 语义对齐；修法 = `env_run_max` 显式处理 "0" → None）
- **目标**：修复审查发现的【严重】问题。
- **审查裁定（将军）**：
  - 【严重1】window_focus.py `SetWindowPos` 的 HWND_TOPMOST 未声明 argtypes → 64 位下置顶失效（实测 GetLastError=1400），且假报成功。**裁定：必须改**（核心需求失效）。
  - 【严重2】runtime.py `_close_platform_browser` 不查 browser_retention → 猎聘/51job 验证码保留完全无效。**裁定：必须改**（核心需求失效）。
  - 【中等3】验证码保留后 `_browser` 存活，下一轮复用验证码页面。**裁定：必须改**。
  - 【中等4】chat_action 内外层 wait_for 同值，内层永远先被外层截断。**裁定：必须改**。
  - 【中等5】测试盲区。**裁定：改**。
  - 【轻微】三项。**裁定：改**。
- **修复内容**：
  - 严重1：window_focus 全部 Win32 调用声明 argtypes，`c_void_p(-1)/(-2)`，返回值真实检查
  - 严重2：`close_platform_browser` 提取为模块级函数，所有分支前检查 browser_retention
  - 中等3：runner_loop 复用页面前探测 captcha_visible，命中则 shutdown 重开
  - 中等4：chat_action 外层 timeout+1，给内层自然收尾
  - 中等5：补 2 个多平台用例；JD 超时测试从 20s 降到 0.05s（套件 36s→16s）
  - 轻微：_find_window_pid 补 argtypes；修掉空操作 monkeypatch；兵种模型 ID 去 [1m] 后缀
- **验证**：556 passed, 1 skipped；tsc 0 错误；`c_void_p(-1) → 0xffffffffffffffff` 编组静态验证 PASS
- **复审**：soldier-reviewer 定向复审「全部到位，无新引入风险」
- **局限**：当前 shell 环境无交互桌面（0 个可见窗口），无法实测窗口真实弹出效果；需用户在真实桌面环境手动验证。

### Ruling 记录（Task 3）
- Ruling: 用静态编组验证代替真实窗口测试 — 当前 shell 是 Session 0 无桌面，`GetForegroundWindow()` 返回 None、EnumWindows 枚举 0 个窗口，无法实测 — 若真实桌面仍不生效，需用户实测反馈后排查（已用 `log.warning` 暴露失败原因，不会静默）。
- Ruling: 模块级 `close_platform_browser` 提取而非保留嵌套 — 嵌套函数无法被单测直接调用，而这是审查发现的严重盲区 — 若提取改变语义，556 测试中有 2 个多平台用例兜底。
- Ruling: 多平台浏览器会被关两次（`_wrap_platform` + `runner._wrap`）— 幂等，只多一行日志 — 若日志噪音困扰用户，后续可加去重标记。

