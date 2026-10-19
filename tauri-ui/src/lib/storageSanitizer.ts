/**
 * 客户端 LocalStorage 版本隔离守卫
 *
 * 解决问题：
 * 1. 旧版本残留的开发期通知日志（125 条）在版本升级后继续悬挂在侧边栏
 * 2. 旧版本调试崩溃留下的破损对话污染 AI 智能管家
 *
 * 设计边界（2026-10-19 审查修订）：
 * - **不做**开发者账号拦截：localStorage 不进安装包，真实新用户不可能
 *   继承开发者身份（"冒名继承"只在打包机本地自测时出现，是测试环境问题
 *   而非产品缺陷）；反之若拦截，开发者本人将无法登录正式版。
 * - **不整段清除**管家对话历史：升级用户的正常对话是用户资产，破损消息
 *   由 agentSlice.loadSavedAgentMessages 做逐条过滤（保留正常部分）。
 * - 仅清空通知日志：运行通知非关键资产，版本切换时归零可接受。
 */

// 发版时必须同步（由 storageSanitizer.test.ts 的版本守卫测试强制校验，
// 与 package.json version 不一致时 vitest 会红）。
export const CURRENT_STORAGE_VERSION = "0.8.0";
const VERSION_KEY = "jobkoi_app_storage_version";
const CLIENT_VERSION_KEY = "jobkoi_client_version";

export function sanitizeStorageOnStartup(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const recordedVersion =
      localStorage.getItem(VERSION_KEY) || localStorage.getItem(CLIENT_VERSION_KEY);

    // 跨版本升级或新安装（recordedVersion 不匹配）：清空旧版遗留的
    // 开发期通知日志。通知是运行时产物而非用户资产，归零安全。
    if (recordedVersion !== CURRENT_STORAGE_VERSION) {
      if (localStorage.getItem("jobhunter_audit_notifications_v1")) {
        console.info("[storageSanitizer] 检测到版本升级或新安装，清空旧版通知日志");
        localStorage.removeItem("jobhunter_audit_notifications_v1");
      }

      localStorage.setItem(VERSION_KEY, CURRENT_STORAGE_VERSION);
      localStorage.setItem(CLIENT_VERSION_KEY, CURRENT_STORAGE_VERSION);
    }
  } catch (err) {
    console.warn("[storageSanitizer] 初始化安全检查略过:", err);
  }
}

// 模块被载入时立即同步执行，确保在任何 React 组件与 Zustand Store
// 初始化前完成净化（main.tsx 首行 import 本模块）。
if (typeof window !== "undefined" && window.localStorage) {
  sanitizeStorageOnStartup();
}
