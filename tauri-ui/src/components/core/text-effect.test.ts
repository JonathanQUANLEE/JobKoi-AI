import { describe, expect, it } from "vitest";
import React from "react";
import { TextEffect, TextEffectSpeed } from "./text-effect";

describe("TextEffect component", () => {
  it("exports TextEffect and TextEffectSpeed correctly", () => {
    expect(TextEffect).toBeDefined();
    expect(TextEffectSpeed).toBeDefined();
  });

  it("can construct TextEffect element with fade-in-blur preset and motion-primitives props", () => {
    const el = React.createElement(TextEffect, {
      children: "向 AI 顾问说出你的情况，定制专属求职画像",
      preset: "fade-in-blur",
      speedReveal: 1.1,
      speedSegment: 0.3,
      delay: 0,
      trigger: true,
    });

    expect(el).toBeDefined();
    expect(el.props.preset).toBe("fade-in-blur");
    expect(el.props.speedReveal).toBe(1.1);
    expect(el.props.speedSegment).toBe(0.3);
  });

  it("can construct TextEffectSpeed preset example component", () => {
    const el = React.createElement(TextEffectSpeed);
    expect(el).toBeDefined();
    expect(el.type).toBe(TextEffectSpeed);
  });
});
