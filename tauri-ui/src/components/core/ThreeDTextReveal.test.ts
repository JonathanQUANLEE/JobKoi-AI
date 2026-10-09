import { describe, expect, it } from "vitest";
import React from "react";
import { ThreeDTextReveal, TextReveal } from "./ThreeDTextReveal";

describe("ThreeDTextReveal component (React Bits Pro 3D cylinder text reveal)", () => {
  it("exports ThreeDTextReveal and alias TextReveal correctly", () => {
    expect(ThreeDTextReveal).toBeDefined();
    expect(TextReveal).toBeDefined();
    expect(ThreeDTextReveal).toBe(TextReveal);
  });

  it("can construct ThreeDTextReveal with default configuration <ThreeDTextReveal />", () => {
    const el = React.createElement(ThreeDTextReveal);
    expect(el).toBeDefined();
    expect(el.type).toBe(ThreeDTextReveal);
  });

  it("can construct ThreeDTextReveal with custom items, perspective and gap", () => {
    const customItems = [
      "向 AI 顾问说出你的情况",
      "智能定制专属求职画像",
      "全自动化精准岗位巡航",
    ];
    const el = React.createElement(ThreeDTextReveal, {
      items: customItems,
      perspective: 1100,
      gap: 28,
      fontSize: "clamp(2rem, 4vw, 3rem)",
      fontWeight: 800,
      autoCycle: false,
      showScrollIndicator: true,
    });

    expect(el).toBeDefined();
    expect(el.props.items).toEqual(customItems);
    expect(el.props.perspective).toBe(1100);
    expect(el.props.gap).toBe(28);
    expect(el.props.autoCycle).toBe(false);
    expect(el.props.showScrollIndicator).toBe(true);
  });

  it("supports text prop as alias for items", () => {
    const lines = ["Line 1", "Line 2"];
    const el = React.createElement(ThreeDTextReveal, {
      text: lines,
    });
    expect(el.props.text).toEqual(lines);
  });
});
