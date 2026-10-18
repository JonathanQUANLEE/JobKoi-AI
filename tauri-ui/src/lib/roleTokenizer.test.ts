import { describe, expect, it } from "vitest";
import { joinRoleTags, smartSplitSpaceSeparated, splitRoleInput } from "./roleTokenizer";

/**
 * 与后端 tests/test_query_fission.py 的智能切词用例互为镜像——
 * 改任何一端必须同步另一端（否则 GUI 预览与实际搜索词分叉）。
 */

describe("splitRoleInput — 智能切词（镜像后端）", () => {
  it("PRD 经典案例：混合拉丁+中文后缀的长串按岗位短语切开", () => {
    expect(splitRoleInput("AI Agent 实习 AI Agent AI 应用工程师")).toEqual([
      "AI Agent 实习",
      "AI Agent",
      "AI 应用工程师",
    ]);
  });

  it("PRD 文科案例：销售/销售管理/客户经理 各自成词", () => {
    expect(splitRoleInput("销售 销售管理 客户经理")).toEqual([
      "销售",
      "销售管理",
      "客户经理",
    ]);
  });

  it("两个简单岗位：Java 开发 / Python 后端", () => {
    expect(splitRoleInput("Java 开发 Python 后端")).toEqual(["Java 开发", "Python 后端"]);
  });

  it("零回归：单个含空格岗位名原样保留", () => {
    expect(splitRoleInput("AI agent 实习")).toEqual(["AI agent 实习"]);
    expect(splitRoleInput("资深 算法工程师")).toEqual(["资深 算法工程师"]);
    expect(splitRoleInput("AI Agent")).toEqual(["AI Agent"]);
  });

  it("显式分隔符优先：多段不再二次猜测", () => {
    expect(splitRoleInput("AI agent 实习, 水利水电实习")).toEqual([
      "AI agent 实习",
      "水利水电实习",
    ]);
  });

  it("斜杠从不切分（一个岗位名）", () => {
    expect(splitRoleInput("AI/算法工程师")).toEqual(["AI/算法工程师"]);
  });

  it("空串与全分隔符 → 空数组", () => {
    expect(splitRoleInput("")).toEqual([]);
    expect(splitRoleInput(",, 、；")).toEqual([]);
  });
});

describe("smartSplitSpaceSeparated — 单段兜底", () => {
  it("单段无收口词 → 返回空数组（调用方保留原文）", () => {
    expect(smartSplitSpaceSeparated("前端 后端")).toEqual([]);
  });
});

describe("joinRoleTags — 标签序列化", () => {
  it("标签列表 → 中文逗号串（后端显式分隔符直读）", () => {
    expect(joinRoleTags(["AI Agent 实习", "大模型实习"])).toBe("AI Agent 实习，大模型实习");
  });

  it("空标签被过滤；空数组 → 空串", () => {
    expect(joinRoleTags(["AI 实习", "  ", ""])).toBe("AI 实习");
    expect(joinRoleTags([])).toBe("");
  });
});
