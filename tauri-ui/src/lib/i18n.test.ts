import { describe, expect, it } from "vitest";
import { optionLabel, translate } from "./i18n";

describe("optionLabel", () => {
  it("uses Chinese labels for rule options", () => {
    expect(optionLabel("zh", "match.contains")).toBe("包含关键词");
    expect(optionLabel("zh", "match.regex")).toBe("正则匹配");
    expect(optionLabel("zh", "scope.title_description")).toBe("岗位名称 + 正文");
  });

  it("uses English labels for rule options", () => {
    expect(optionLabel("en", "match.contains")).toBe("Contains");
    expect(optionLabel("en", "match.regex")).toBe("Regular expression");
    expect(optionLabel("en", "scope.title_description")).toBe("Title + description");
  });

  it("uses English labels for the main dashboard controls", () => {
    expect(translate("en", "panel.run")).toBe("Run Panel");
    expect(translate("en", "button.start")).toBe("Start");
    expect(translate("en", "button.openManualBrowser")).toBe("Open BOSS page");
    expect(translate("en", "field.requiredKeywords")).toBe("Required keywords (optional)");
    expect(translate("en", "field.startUrl")).toBe("Start page URL");
  });

  it("interpolates runtime status labels", () => {
    expect(translate("zh", "status.runningIndex", { index: 3 })).toBe("运行中，第 3 个岗位");
    expect(translate("en", "status.runningIndex", { index: 3 })).toBe("Running, job #3");
  });
});
