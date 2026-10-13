import { ipc } from "./ipc";

/**
 * 跨平台打开用户操作系统默认外部浏览器访问 URL。
 * 
 * 彻底解决 Tauri 2 / Webview2 内部 window.open 被静默拦截或无响应的问题：
 * 1. 优先调用 Python 后端 `open_external_url` (基于 Python `webbrowser.open` / OS ShellExecute)，100% 唤起系统浏览器；
 * 2. 失败时平滑回退至 window.open 与动态 <a> 标签模拟点击。
 */
export async function openSystemBrowser(url: string): Promise<boolean> {
  const target = (url || "").trim();
  if (!target) return false;

  // 1. 优先调用后端命令唤起默认外部浏览器
  try {
    const res = await ipc.openExternalUrl(target);
    if (res?.status === "ok") {
      return true;
    }
  } catch (err) {
    console.warn("Backend open_external_url failed, attempting frontend fallback:", err);
  }

  // 2. 兜底回退：前端 window.open
  try {
    const win = window.open(target, "_blank", "noopener,noreferrer");
    if (win) return true;
  } catch (err) {
    console.warn("window.open failed:", err);
  }

  // 3. 兜底回退：模拟 <a> 标签点击
  try {
    const anchor = document.createElement("a");
    anchor.href = target;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  }
}
