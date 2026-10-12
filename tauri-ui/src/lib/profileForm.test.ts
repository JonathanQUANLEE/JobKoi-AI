import { describe, expect, it } from "vitest";
import { buildProfileData, toggleCsvValue, type ProfileFormValues } from "./profileForm";

const baseValues: ProfileFormValues = {
  label: "后端开发实习",
  startUrl: "",
  rule: {
    requiredKeywords: "",
    anyKeywords: "后端开发",
    excludeKeywords: "销售",
    scope: "title",
    match: "contains",
    caseSensitive: false,
  },
  cityValues: "",
  educationValues: "",
  bossActiveValues: "",
  filterPolicy: "warning",
  mode: "auto",
  greetingPath: "./greetings/default.txt",
  delayMin: "20",
  delayMax: "40",
  liepinDelayMin: "",
  liepinDelayMax: "",
  job51DelayMin: "",
  job51DelayMax: "",
  maxSent: "50",
  dailyLimit: "80",
  stopOnCaptcha: true,
  sendResumeAfterGreeting: false,
  autoResumeOnReply: false,
  aiGreeting: false,
};

describe("buildProfileData 城市宽容解析（落盘兜底线）", () => {
  it("空格/顿号/分号等任意分隔 → 干净数组", () => {
    const data = buildProfileData({ ...baseValues, cityValues: "深圳 广州、东莞;上海" });
    expect(data.page_filters.city.values).toEqual(["深圳", "广州", "东莞", "上海"]);
    expect(data.page_filters.city.enabled).toBe(true);
  });

  it("去「市」后缀归一", () => {
    const data = buildProfileData({ ...baseValues, cityValues: "深圳市,杭州市" });
    expect(data.page_filters.city.values).toEqual(["深圳", "杭州"]);
  });

  it("垃圾输入全过滤 → 城市筛选关闭（enabled=false），不崩", () => {
    const data = buildProfileData({ ...baseValues, cityValues: "🔥 我想在城市找工作" });
    expect(data.page_filters.city.values).toEqual([]);
    expect(data.page_filters.city.enabled).toBe(false);
  });

  it("标准逗号输入行为不变（回归保护）", () => {
    const data = buildProfileData({ ...baseValues, cityValues: "广州,深圳" });
    expect(data.page_filters.city.values).toEqual(["广州", "深圳"]);
  });
});

describe("buildProfileData", () => {
  it("converts GUI form values to profile YAML data", () => {
    const data = buildProfileData({
      ...baseValues,
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
      sendResumeAfterGreeting: true,
      autoResumeOnReply: false,
      aiGreeting: false,
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
        // 12s 低于拟人化安全下限 15s（防风控），落盘前钳到 15
        delay_min: 15,
        delay_max: 45,
        max_sent: 50,
        daily_sent_limit: 80,
        stop_on_captcha: true,
        send_resume_after_greeting: true,
        auto_send_resume_on_reply: false,
        ai_greeting: false,
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
      ...baseValues,
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
      sendResumeAfterGreeting: false,
      autoResumeOnReply: false,
      aiGreeting: false,
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
      // 坏值回退默认（标准档 20-40）；60s 超上限 45 钳到 45
      delay_min: 20,
      delay_max: 45,
      max_sent: 50,
      daily_sent_limit: 80,
    });
  });

  it("clamps humanized delay into the safe range [15, 45] seconds", () => {
    const mk = (delayMin: string, delayMax: string) =>
      buildProfileData({
        ...baseValues,
        label: "AI",
        startUrl: "",
        rule: {
          requiredKeywords: "",
          anyKeywords: "AI",
          excludeKeywords: "",
          scope: "title",
          match: "contains",
          caseSensitive: false,
        },
        cityValues: "",
        educationValues: "",
        bossActiveValues: "",
        filterPolicy: "warning",
        mode: "auto",
        greetingPath: "",
        delayMin,
        delayMax,
        maxSent: "50",
        dailyLimit: "80",
        stopOnCaptcha: true,
        sendResumeAfterGreeting: false,
        autoResumeOnReply: false,
        aiGreeting: false,
      });

    // 危险低值（雾化弹窗旧默认 3-6）→ 钳到安全下限
    expect(mk("3", "6").send).toMatchObject({ delay_min: 15, delay_max: 15 });
    // 空值 → 标准档默认 20-40
    expect(mk("", "").send).toMatchObject({ delay_min: 20, delay_max: 40 });
    // 超上限 → 钳到 45
    expect(mk("50", "80").send).toMatchObject({ delay_min: 45, delay_max: 45 });
    // 区间内的值原样保留
    expect(mk("15", "45").send).toMatchObject({ delay_min: 15, delay_max: 45 });
    expect(mk("30", "45").send).toMatchObject({ delay_min: 30, delay_max: 45 });
  });

  it("stores title plus description as a reusable matching scope", () => {
    const data = buildProfileData({
      ...baseValues,
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
      sendResumeAfterGreeting: false,
      autoResumeOnReply: false,
      aiGreeting: false,
    });

    expect(data.filters.title.required.scope).toBe("title_description");
    expect(data.filters.title.any.scope).toBe("title_description");
  });

  it("分平台延迟：未单设不落盘（回退通用档），单设值同样钳进安全区间", () => {
    // 全部未单设（空串 = 跟随通用档）→ send 里不出现分平台字段
    const follow = buildProfileData(baseValues);
    expect(follow.send).not.toHaveProperty("liepin_delay_min");
    expect(follow.send).not.toHaveProperty("liepin_delay_max");
    expect(follow.send).not.toHaveProperty("job51_delay_min");
    expect(follow.send).not.toHaveProperty("job51_delay_max");

    // 猎聘单设效率档 15-30；51job 单设越界值 10-90 → 钳到 15-45
    const separated = buildProfileData({
      ...baseValues,
      liepinDelayMin: "15",
      liepinDelayMax: "30",
      job51DelayMin: "10",
      job51DelayMax: "90",
    });
    expect(separated.send).toMatchObject({
      liepin_delay_min: 15,
      liepin_delay_max: 30,
      job51_delay_min: 15,
      job51_delay_max: 45,
    });
    // 通用档不受分平台单设影响
    expect(separated.send).toMatchObject({ delay_min: 20, delay_max: 40 });
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
