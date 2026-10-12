import { describe, expect, it } from "vitest";
import {
  appendCity,
  normalizeCityInput,
  parseCityList,
  suggestCities,
  toggleCityInList,
} from "./cityInput";

describe("parseCityList — 用户输入全形态防御矩阵", () => {
  it("空值/纯空白不崩，返回空数组", () => {
    expect(parseCityList("")).toEqual([]);
    expect(parseCityList(null)).toEqual([]);
    expect(parseCityList(undefined)).toEqual([]);
    expect(parseCityList("   \n\t  ")).toEqual([]);
  });

  it("空格分隔（旧逻辑会粘连失效的高危形态）", () => {
    expect(parseCityList("深圳 广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳  广州　北京")).toEqual(["深圳", "广州", "北京"]); // 多空格+全角空格
  });

  it("中英文逗号 / 顿号 / 分号 / 斜杠 / 竖线 / 换行全当分隔符", () => {
    expect(parseCityList("深圳,广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳，广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳、广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳;广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳；广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳/广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳|广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳\n广州")).toEqual(["深圳", "广州"]);
    expect(parseCityList("深圳, 广州、东莞;上海｜北京/杭州")).toEqual([
      "深圳",
      "广州",
      "东莞",
      "上海",
      "北京",
      "杭州",
    ]);
  });

  it("白名单归一：去「市」后缀 + 大小写不敏感", () => {
    expect(parseCityList("深圳市")).toEqual(["深圳"]);
    expect(parseCityList("广州市,杭州市")).toEqual(["广州", "杭州"]);
    expect(parseCityList("乌鲁木齐市")).toEqual(["乌鲁木齐"]);
  });

  it("垃圾拦截：emoji / 纯符号 / 整句话粘贴 / 超长段全部丢弃", () => {
    expect(parseCityList("🔥🔥🔥")).toEqual([]);
    expect(parseCityList("！！！,,,")).toEqual([]);
    expect(parseCityList("我想在深圳广州找工作")).toEqual([]); // 无分隔整句 → 超长丢弃
    expect(parseCityList("深圳,🎉,广州")).toEqual(["深圳", "广州"]);
  });

  it("去重保序 + 数量上限 20", () => {
    expect(parseCityList("深圳,深圳,广州,深圳")).toEqual(["深圳", "广州"]);
    const many = Array.from({ length: 30 }, (_, i) => `城市${i}号`).join(",");
    expect(parseCityList(many).length).toBe(20);
  });

  it("「全国」语义：单独=全国；与具体城市并存=全国优先", () => {
    expect(parseCityList("全国")).toEqual(["全国"]);
    expect(parseCityList("全国,深圳,广州")).toEqual(["全国"]);
  });

  it("冷门城市（不在白名单但合法）原样保留，不误删用户意向", () => {
    expect(parseCityList("昆山")).toEqual(["昆山"]);
    expect(parseCityList("深圳,昆山")).toEqual(["深圳", "昆山"]);
  });
});

describe("normalizeCityInput", () => {
  it("宽容输入 → 标准逗号串", () => {
    expect(normalizeCityInput("深圳 广州 北京市")).toBe("深圳,广州,北京");
    expect(normalizeCityInput("  ")).toBe("");
  });
});

describe("suggestCities — 自动补全", () => {
  it("按最后一段前缀/包含匹配，排除已选", () => {
    expect(suggestCities("深")).toContain("深圳");
    expect(suggestCities("深圳,广")).toContain("广州");
    expect(suggestCities("深圳,广")).not.toContain("深圳"); // 已选排除
  });

  it("完整城市词（无需补全）或空输入 → 无建议", () => {
    expect(suggestCities("")).toEqual([]);
    expect(suggestCities("深圳")).toEqual([]); // 已是完整白名单城市
    expect(suggestCities("全国")).toEqual([]);
  });

  it("超长垃圾查询 → 无建议不崩", () => {
    expect(suggestCities("我想在深圳广州找工作")).toEqual([]);
  });
});

describe("appendCity / toggleCityInList", () => {
  it("appendCity：基于宽容解析合并，去重", () => {
    expect(appendCity("深圳 广州", "北京")).toBe("深圳,广州,北京");
    expect(appendCity("深圳", "深圳")).toBe("深圳");
    expect(appendCity("深圳市", "广州")).toBe("深圳,广州"); // 归一后追加
  });

  it("toggleCityInList：切换语义 + 全国=清空", () => {
    expect(toggleCityInList("深圳,广州", "广州")).toBe("深圳");
    expect(toggleCityInList("深圳", "广州")).toBe("深圳,广州");
    expect(toggleCityInList("深圳,广州", "全国")).toBe("");
    expect(toggleCityInList("深圳 广州", "广州市")).toBe("深圳"); // 宽容+归一切换
  });
});
