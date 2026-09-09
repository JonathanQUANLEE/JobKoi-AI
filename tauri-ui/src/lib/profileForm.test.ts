import { describe, expect, it } from "vitest";
import { buildProfileData, toggleCsvValue } from "./profileForm";

describe("buildProfileData", () => {
  it("converts GUI form values to profile YAML data", () => {
    const data = buildProfileData({
      label: " 后端开发实习 ",
      startUrl: " https://example.test/jobs?city=101280600 ",
      rule: {
        requiredKeywords: "实习，校招\n远程",
        anyKeywords: "后端开发,AI",
        excludeKeywords: "销售,客服",
        scope: "title",
        match: "regex",
        caseSensitive: true,
      },
      cityValues: "广州,深圳",
      educationValues: "本科",
      bossActiveValues: "刚刚活跃,今日活跃",
      filterPolicy: "strict",
      mode: "auto",
      greetingPath: "./greetings/custom.txt",
      delayMin: "12",
      delayMax: "45",
      maxSent: "50",
      dailyLimit: "80",
      stopOnCaptcha: true,
    });

    expect(data).toEqual({
      search: {
        query: "后端开发实习",
        start_url: "https://example.test/jobs?city=101280600",
      },
      page_filters: {
        strict: true,
        city: { enabled: true, values: ["广州", "深圳"] },
        education: { enabled: true, values: ["本科"] },
        boss_active: { enabled: true, values: ["刚刚活跃", "今日活跃"] },
      },
      filters: {
        title: {
          required: {
            enabled: true,
            scope: "title",
            match: "regex",
            case_sensitive: true,
            keywords: ["实习", "校招", "远程"],
          },
          any: {
            enabled: true,
            scope: "title",
            match: "regex",
            case_sensitive: true,
            keywords: ["后端开发", "AI"],
          },
          exclude: {
            enabled: true,
            scope: "title",
            match: "regex",
            case_sensitive: true,
            keywords: ["销售", "客服"],
          },
        },
      },
      send: {
        mode: "auto",
        greeting_file: "./greetings/custom.txt",
        delay_min: 12,
        delay_max: 45,
        max_sent: 50,
        daily_sent_limit: 80,
        stop_on_captcha: true,
      },
      state: {
        seen_jobs_file: "./logs/seen_jobs.jsonl",
        sent_log_file: "./logs/sent_jobs.jsonl",
        skipped_log_file: "./logs/skipped_jobs.jsonl",
      },
    });
  });

  it("uses safe defaults for blank optional form values", () => {
    const data = buildProfileData({
      label: "",
      startUrl: "",
      rule: {
        requiredKeywords: "",
        anyKeywords: "AI",
        excludeKeywords: "",
        scope: "description",
        match: "contains",
        caseSensitive: false,
      },
      cityValues: "",
      educationValues: "",
      bossActiveValues: "",
      filterPolicy: "warning",
      mode: "scan",
      greetingPath: "",
      delayMin: "abc",
      delayMax: "60",
      maxSent: "",
      dailyLimit: "80",
      stopOnCaptcha: false,
    });

    expect(data.search.query).toBe("");
    expect(data.page_filters).toMatchObject({
      strict: false,
      city: { enabled: false, values: [] },
      education: { enabled: false, values: [] },
      boss_active: { enabled: false, values: [] },
    });
    expect(data.filters.title.required.enabled).toBe(false);
    expect(data.filters.title.any.enabled).toBe(true);
    expect(data.filters.title.exclude.enabled).toBe(false);
    expect(data.send).toMatchObject({
      greeting_file: "./greetings/default.txt",
      delay_min: 10,
      delay_max: 60,
      max_sent: 50,
      daily_sent_limit: 80,
    });
  });

  it("stores title plus description as a reusable matching scope", () => {
    const data = buildProfileData({
      label: "AI应用实习",
      startUrl: "",
      rule: {
        requiredKeywords: "实习",
        anyKeywords: "AI",
        excludeKeywords: "",
        scope: "title_description",
        match: "contains",
        caseSensitive: false,
      },
      cityValues: "",
      educationValues: "",
      bossActiveValues: "",
      filterPolicy: "warning",
      mode: "auto",
      greetingPath: "",
      delayMin: "10",
      delayMax: "60",
      maxSent: "50",
      dailyLimit: "80",
      stopOnCaptcha: true,
    });

    expect(data.filters.title.required.scope).toBe("title_description");
    expect(data.filters.title.any.scope).toBe("title_description");
  });
});

describe("toggleCsvValue", () => {
  it("adds a clicked option to comma separated custom values", () => {
    expect(toggleCsvValue("广州, 深圳", "上海")).toBe("广州,深圳,上海");
  });

  it("removes a clicked option that already exists", () => {
    expect(toggleCsvValue("广州,深圳,广州", "广州")).toBe("深圳");
  });
});
