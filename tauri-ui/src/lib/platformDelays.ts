/**
 * 分平台拟人化延迟预设（2026-10-13 用户拍板：BOSS/猎聘/前程无忧每平台
 * 独立三档；猎聘/51job 未单设时回退通用档 delayMin/Max）。
 *
 * 区间 [15,45]s 与后端 platforms/limits.py 的 *_DELAY_RANGE_SECONDS
 * 单一来源一致；三档数值是 GUI 预设，落盘前仍经 profileForm 的
 * clampDelayOrDefault 钳制，后端运行时还有一道同值钳制兜底。
 */
export type DelayPreset = {
  key: string;
  descKey: string;
  min: string;
  max: string;
};

export const DELAY_PRESETS: DelayPreset[] = [
  { key: "policy.preset.fast", descKey: "policy.preset.fastDesc", min: "15", max: "30" },
  { key: "policy.preset.standard", descKey: "policy.preset.standardDesc", min: "20", max: "40" },
  { key: "policy.preset.safe", descKey: "policy.preset.safeDesc", min: "30", max: "45" },
];

/** 某平台当前值是否命中某档预设（min 与 max 同时相等才算）。 */
export function isPresetActive(min: string, max: string, preset: DelayPreset): boolean {
  return min === preset.min && max === preset.max;
}

/** 猎聘/51job 是否处于「跟随通用档」状态（min/max 均未单设）。 */
export function isFollowGeneric(min: string, max: string): boolean {
  return min.trim() === "" && max.trim() === "";
}
