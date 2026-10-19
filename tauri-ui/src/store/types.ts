import type { AgentSlice } from "./agentSlice";
import type { HeroSlice } from "./heroSlice";
import type { NoticeSlice } from "./noticeSlice";
import type { RunSlice } from "./runSlice";
import type { UiSlice } from "./ui";
import type { UpdateSlice } from "./updateSlice";

/** 合并后的完整 store 形状（与拆分前的 RunState 逐字段等价，除已移除的死字段 notification）。 */
export type RunStore = RunSlice & NoticeSlice & AgentSlice & HeroSlice & UiSlice & UpdateSlice;
