import { useCallback, useEffect, useRef } from "react";
import { ipc } from "../lib/ipc";
import { withTimeout } from "../lib/withTimeout";
import { useRunStore } from "../store";

/**
 * 登录确认轮询引擎（从 PlatformHub 下沉）。
 *
 * 背景：open_platform_login 现在秒回（不等扫码），由前端每 4s 轻量探测一次登录态；
 * 探测成功即自动关浏览器（优雅退出保 cookie 落盘）+ FaceID 式反馈 + 刷新平台卡片。
 *
 * @param onLoginSuccess 登录确认后的刷新回调（如重新拉取平台列表）
 */
export function useLoginPolling(onLoginSuccess: () => void | Promise<void>) {
  const loginPollRef = useRef<number | null>(null);

  const stopLoginPoll = useCallback(() => {
    if (loginPollRef.current != null) {
      window.clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
  }, []);

  // 组件卸载时停掉轮询，防止后台幽灵定时器
  useEffect(() => stopLoginPoll, [stopLoginPoll]);

  const startLoginPoll = useCallback(
    (platformId: string) => {
      stopLoginPoll();
      let attempts = 0;
      loginPollRef.current = window.setInterval(async () => {
        attempts += 1;
        if (attempts > 120) {
          stopLoginPoll(); // 4s × 120 = 8 分钟上限
          return;
        }
        try {
          const st = await withTimeout(
            ipc.checkLoginStatus(platformId),
            10_000,
            "登录状态探测",
          );
          if (st && st.logged_in) {
            stopLoginPoll();
            // 登录成功：先展示 FaceID 绿对勾与提示音，给用户清晰的视觉/听觉反馈
            useRunStore.getState().updateLoginOverlay({ status: "success" });
            // 缓冲 1000ms：确保浏览器完成扫码后的最终跳转并完成 Cookie/Session 磁盘写入
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            try {
              await ipc.shutdownBrowser();
            } catch {
              /* 关闭失败不阻塞提示 */
            }
            window.setTimeout(() => {
              useRunStore.getState().hideLoginOverlay();
              useRunStore.getState().showCenterToast("检测到您已登录 · 认证成功", {
                tone: "success",
                duration: 2200,
              });
            }, 1200);
            await onLoginSuccess();
          }
        } catch {
          /* 单次探测失败/超时：继续下一轮，不打扰用户 */
        }
      }, 4000);
    },
    [stopLoginPoll, onLoginSuccess],
  );

  return { startLoginPoll, stopLoginPoll };
}
