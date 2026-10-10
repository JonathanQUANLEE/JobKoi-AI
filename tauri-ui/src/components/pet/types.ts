export type PetAction =
  | "idle"
  | "walk"
  | "run"
  | "sit"
  | "sleep"
  | "drag"
  | "land"
  | "celebrate"
  | "waving";

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
  walk: 1,
  run: 2,
  sit: 3,
  sleep: 4,
  drag: 5,
  land: 6,
  celebrate: 7,
  waving: 8,
};

export const PET_FRAME_COUNT = 8;
export const PET_FRAME_WIDTH = 192;
export const PET_FRAME_HEIGHT = 208;
