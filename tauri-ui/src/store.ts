/**兼容门面：实现已按域拆分至 src/store/ 包（P3-3，2026-10）。
 * 保留本文件与原导出名，所有 `from "../store"` 的消费代码零改动。 */
export { useRunStore, useT } from "./store/index";
export { getInitialTheme, applyThemeToDOM } from "./store/ui";
export type { AppTheme } from "./store/ui";
export type { NotificationItem } from "./store/noticeSlice";
