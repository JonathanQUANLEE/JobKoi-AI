export type PetAction =
  | "idle"        // Row 0: 站立与动耳朵待机
  | "walk_right"  // Row 1: 向右走动奔跑
  | "walk_left"   // Row 2: 向左走动奔跑
  | "waving"      // Row 3: 招手/动作
  | "jump"        // Row 4: 蹦跳欢呼
  | "failed"      // Row 5: 晕倒/失败
  | "waiting"     // Row 6: 思考冒泡
  | "running"     // Row 7: 全速狂奔
  | "roll";       // Row 8: 乌萨奇经典疯狂甩手大风车旋转 (Usagi Roll)

export interface PetScheduleConfig {
  enabled: boolean;
  time: string; // "HH:mm", e.g. "09:00"
  repeatDays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  autoRun: boolean;
  soundNotify: boolean;
}

export const DEFAULT_SCHEDULE_CONFIG: PetScheduleConfig = {
  enabled: false,
  time: "09:00",
  repeatDays: [1, 2, 3, 4, 5], // 工作日
  autoRun: true,
  soundNotify: true,
};

export const PET_ACTION_ROWS: Record<PetAction, number> = {
  idle: 0,
  walk_right: 1,
  walk_left: 2,
  waving: 3,
  jump: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  roll: 8,
};

export const PET_FRAME_COUNT = 8;
export const PET_FRAME_WIDTH = 192;
export const PET_FRAME_HEIGHT = 208;
