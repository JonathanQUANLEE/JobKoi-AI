; JobKoi-AI NSIS 自定义卸载生命周期钩子
;
; 只清理 %LOCALAPPDATA%\com.jonathanquanlee.jobkoi-ai（WebView2 的
; EBWebView 缓存：localStorage / 会话 / 登录态），杜绝"卸载重装继承
; 旧登录态与本地存储"。
;
; **刻意保留** %APPDATA%\com.jonathanquanlee.jobkoi-ai（Roaming）：
; 那里是用户画像 profiles/、投递记录 logs/、简历绑定 resume/、
; agent_config.json 等用户资产——卸载不应销毁用户数据（2026-10-19
; 审查决策：数据安全优先，误删代价高于残留）。

!macro NSIS_HOOK_PREUNINSTALL
    RMDir /r "$LOCALAPPDATA\com.jonathanquanlee.jobkoi-ai"
!macroend
