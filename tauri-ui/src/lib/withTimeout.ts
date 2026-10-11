/** IPC 兜底超时（fail-fast 语义）。
 *
 * 后端正常毫秒级返回；一旦挂死，前端在 ms 后显式抛错——配合界面的
 * 错误提示 + 重试按钮，绝不让用户盯着无限空白。
 *
 * 注意：这与 useHeroChat 里的"优雅降级超时"（超时 resolve 一个
 * {status:"timeout"} 走本地兜底）是**两种不同语义**，故意不合并。
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s 无响应）`)), ms),
    ),
  ]);
}
