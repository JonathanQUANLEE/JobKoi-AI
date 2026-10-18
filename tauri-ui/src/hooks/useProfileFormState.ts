import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { ipc, type LoadedProfile, type ProfileSummary, type ProfileData } from "../lib/ipc";
import {
  buildProfileData,
  type FilterPolicy,
  type Mode,
  type RuleForm,
} from "../lib/profileForm";
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_GREETING,
  DEFAULT_RULE,
  asRecord,
  asString,
  asBool,
  asMode,
  asScope,
  asMatchMode,
  joinKeywords,
  toRepoRelativePath,
} from "../lib/dashboardHelpers";

interface UseProfileFormStateOptions {
  t: (key: string, vars?: Record<string, string | number>) => string;
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
}

export interface UseProfileFormStateReturn {
  profiles: ProfileSummary[];
  setProfiles: Dispatch<SetStateAction<ProfileSummary[]>>;
  profileName: string;
  setProfileName: Dispatch<SetStateAction<string>>;
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  usrName: string;
  setUsrName: Dispatch<SetStateAction<string>>;
  label: string;
  setLabel: Dispatch<SetStateAction<string>>;
  startUrl: string;
  setStartUrl: Dispatch<SetStateAction<string>>;
  greeting: string;
  setGreeting: Dispatch<SetStateAction<string>>;
  greetingPath: string;
  setGreetingPath: Dispatch<SetStateAction<string>>;
  rule: RuleForm;
  setRule: Dispatch<SetStateAction<RuleForm>>;
  cityValues: string;
  setCityValues: Dispatch<SetStateAction<string>>;
  educationValues: string;
  setEducationValues: Dispatch<SetStateAction<string>>;
  bossActiveValues: string;
  setBossActiveValues: Dispatch<SetStateAction<string>>;
  filterPolicy: FilterPolicy;
  setFilterPolicy: Dispatch<SetStateAction<FilterPolicy>>;
  delayMin: string;
  setDelayMin: Dispatch<SetStateAction<string>>;
  delayMax: string;
  setDelayMax: Dispatch<SetStateAction<string>>;
  liepinDelayMin: string;
  setLiepinDelayMin: Dispatch<SetStateAction<string>>;
  liepinDelayMax: string;
  setLiepinDelayMax: Dispatch<SetStateAction<string>>;
  job51DelayMin: string;
  setJob51DelayMin: Dispatch<SetStateAction<string>>;
  job51DelayMax: string;
  setJob51DelayMax: Dispatch<SetStateAction<string>>;
  maxSent: string;
  setMaxSent: Dispatch<SetStateAction<string>>;
  // 三平台单轮投递上限（2026-10-17 收尾：上个 agent 写了实现/透传/UI，
  // 漏了这 4 行 interface 声明导致前端编译锁死、新界面没热更到软件上）
  liepinRunMax: string;
  setLiepinRunMax: Dispatch<SetStateAction<string>>;
  job51RunMax: string;
  setJob51RunMax: Dispatch<SetStateAction<string>>;
  dailyLimit: string;
  setDailyLimit: Dispatch<SetStateAction<string>>;
  // 分平台每日投递上限（2026-10-18 三路审查发现的严重缺陷修复）：
  // 设置弹窗里猎聘/前程的"次/天"输入此前只写 localStorage、后端从不读取，
  // 用户调低日限保号实际不生效。补齐状态 → profile → env 全链路。
  liepinDailyLimit: string;
  setLiepinDailyLimit: Dispatch<SetStateAction<string>>;
  job51DailyLimit: string;
  setJob51DailyLimit: Dispatch<SetStateAction<string>>;
  stopOnCaptcha: boolean;
  setStopOnCaptcha: Dispatch<SetStateAction<boolean>>;
  sendResumeAfterGreeting: boolean;
  setSendResumeAfterGreeting: Dispatch<SetStateAction<boolean>>;
  autoResumeOnReply: boolean;
  setAutoResumeOnReply: Dispatch<SetStateAction<boolean>>;
  aiGreeting: boolean;
  setAiGreeting: Dispatch<SetStateAction<boolean>>;

  refreshProfiles: (preferredName?: string) => Promise<void>;
  loadProfile: (name: string) => Promise<void>;
  hydrateFromProfile: (profile: LoadedProfile) => void;
  currentProfileData: () => ProfileData;
  saveConfig: () => Promise<boolean>;
  validateBeforeRun: () => string | null;
}

export function useProfileFormState({
  t,
  setMessage,
  setBusy,
}: UseProfileFormStateOptions): UseProfileFormStateReturn {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profileName, setProfileName] = useState(DEFAULT_PROFILE_NAME);
  const [mode, setMode] = useState<Mode>("auto");
  const [usrName, setUsrName] = useState("");
  const [label, setLabel] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [greetingPath, setGreetingPath] = useState("./greetings/default.txt");
  const [rule, setRule] = useState<RuleForm>(DEFAULT_RULE);
  const [cityValues, setCityValues] = useState("");
  const [educationValues, setEducationValues] = useState("");
  const [bossActiveValues, setBossActiveValues] = useState("");
  const [filterPolicy, setFilterPolicy] = useState<FilterPolicy>("warning");
  const [delayMin, setDelayMin] = useState("20");
  const [delayMax, setDelayMax] = useState("40");
  // 分平台拟人化节奏（2026-10-13）：空串 = 未单设，保存时不落盘、运行时回退 delayMin/Max
  const [liepinDelayMin, setLiepinDelayMin] = useState("");
  const [liepinDelayMax, setLiepinDelayMax] = useState("");
  const [job51DelayMin, setJob51DelayMin] = useState("");
  const [job51DelayMax, setJob51DelayMax] = useState("");
  const [maxSent, setMaxSent] = useState("50");
  // 分平台单轮上限（2026-10-17）：空串 = 未单设，运行时回退系统默认（猎聘 15 / 前程 10）
  const [liepinRunMax, setLiepinRunMax] = useState("");
  const [job51RunMax, setJob51RunMax] = useState("");
  const [dailyLimit, setDailyLimit] = useState("80");
  // 分平台日限（2026-10-18 严重缺陷修复）：空串 = 未单设，运行时回退系统默认（猎聘 50 / 前程 40）
  const [liepinDailyLimit, setLiepinDailyLimit] = useState("");
  const [job51DailyLimit, setJob51DailyLimit] = useState("");
  const [stopOnCaptcha, setStopOnCaptcha] = useState(true);
  const [sendResumeAfterGreeting, setSendResumeAfterGreeting] = useState(false);
  const [autoResumeOnReply, setAutoResumeOnReply] = useState(false);
  const [aiGreeting, setAiGreeting] = useState(false);

  const hydrateFromProfile = useCallback((profile: LoadedProfile) => {
    const data = profile.data;
    const search = asRecord(data.search);
    const filters = asRecord(asRecord(data.filters).title);
    const required = asRecord(filters.required);
    const any = asRecord(filters.any);
    const exclude = asRecord(filters.exclude);
    const send = asRecord(data.send);
    const pageFilters = asRecord(data.page_filters);

    setLabel((prev) => asString(search.query, prev));
    setStartUrl((prev) => asString(search.start_url, prev));
    setMode((prev) => asMode(send.mode, prev));
    setGreetingPath((prev) => asString(send.greeting_file, prev));
    setDelayMin((prev) => asString(send.delay_min, prev));
    setDelayMax((prev) => asString(send.delay_max, prev));
    // 分平台节奏：profile 未单设时显示空串（= 回退 BOSS 通用档）
    setLiepinDelayMin(send.liepin_delay_min != null ? String(send.liepin_delay_min) : "");
    setLiepinDelayMax(send.liepin_delay_max != null ? String(send.liepin_delay_max) : "");
    setJob51DelayMin(send.job51_delay_min != null ? String(send.job51_delay_min) : "");
    setJob51DelayMax(send.job51_delay_max != null ? String(send.job51_delay_max) : "");
    setMaxSent((prev) => asString(send.max_sent, prev));
    setLiepinRunMax(send.liepin_run_max != null ? String(send.liepin_run_max) : "");
    setJob51RunMax(send.job51_run_max != null ? String(send.job51_run_max) : "");
    setDailyLimit((prev) => asString(send.daily_sent_limit, prev));
    // 分平台日限（2026-10-18）：profile 未单设时显示空串（= 回退系统默认）
    setLiepinDailyLimit(send.liepin_daily_limit != null ? String(send.liepin_daily_limit) : "");
    setJob51DailyLimit(send.job51_daily_limit != null ? String(send.job51_daily_limit) : "");
    setStopOnCaptcha((prev) => asBool(send.stop_on_captcha, prev));
    setSendResumeAfterGreeting(asBool(send.send_resume_after_greeting, false));
    setAutoResumeOnReply(asBool(send.auto_send_resume_on_reply, false));
    setAiGreeting(asBool(send.ai_greeting, false));
    setRule((prev) => ({
      requiredKeywords: joinKeywords(required.keywords, prev.requiredKeywords),
      anyKeywords: joinKeywords(any.keywords, prev.anyKeywords),
      excludeKeywords: joinKeywords(exclude.keywords, prev.excludeKeywords),
      scope: asScope(required.scope || any.scope || exclude.scope, prev.scope),
      match: asMatchMode(required.match || any.match || exclude.match, prev.match),
      caseSensitive: asBool(required.case_sensitive, prev.caseSensitive),
    }));
    setFilterPolicy(pageFilters.strict === true ? "strict" : "warning");
    setCityValues((prev) => joinKeywords(asRecord(pageFilters.city).values, prev));
    setEducationValues((prev) => joinKeywords(asRecord(pageFilters.education).values, prev));
    setBossActiveValues((prev) => joinKeywords(asRecord(pageFilters.boss_active).values, prev));
  }, []);

  const loadProfile = useCallback(
    async (name: string) => {
      try {
        const profile = await ipc.getProfile(name);
        hydrateFromProfile(profile);
      } catch (err) {
        setMessage(t("message.profileLoadFailed", { error: String(err) }));
      }
    },
    [hydrateFromProfile, setMessage, t],
  );

  const refreshProfiles = useCallback(
    async (preferredName?: string) => {
      try {
        const result = await ipc.listProfiles();
        setProfiles(result.profiles);
        // 默认名固定为 gui-default：绝不回退到列表里第一个 profile
        // （第一个往往是用户的私有 profile，如 0my——被 09:00 计划任务依赖，
        // GUI 用它会污染/覆盖私有配置）。
        const hasDefault = result.profiles.some(
          (item) => item.name === DEFAULT_PROFILE_NAME,
        );
        const nextName =
          preferredName &&
          result.profiles.some((item) => item.name === preferredName)
            ? preferredName
            : DEFAULT_PROFILE_NAME;
        setProfileName(nextName);
        if (nextName === DEFAULT_PROFILE_NAME && !hasDefault) {
          // 没有 gui-default 且未明确指定其他已有 profile 时：
          // 直接用表单默认值新建，不加载任何现有私有 profile
          return;
        }
        await loadProfile(nextName);
      } catch (err) {
        setMessage(t("message.profileReadFailed", { error: String(err) }));
      }
    },
    [loadProfile, setMessage, t],
  );

  // 所有表单字段的 ref 镜像：绕开「保存回调闭包读旧值」的时序坑。
  // 背景（2026-10-12 两轮实测）：设置弹窗的保存按钮在事件处理器里 setState 后
  // 用 setTimeout(0) 调 saveConfig——回调捕获的仍是点击那一刻的旧闭包，旧值
  // 被写盘 → refreshProfiles 重读磁盘 → hydrate 把表单盖回旧档（"保存后跳回
  // 旧档位"）。ref 每次渲染后同步最新值，setTimeout 回调执行时 ref 已是新值。
  const formValuesRef = useRef<{
    greeting: string;
    values: Parameters<typeof buildProfileData>[0];
  } | null>(null);
  useEffect(() => {
    formValuesRef.current = {
      greeting,
      values: {
        label,
        startUrl,
        rule,
        cityValues,
        educationValues,
        bossActiveValues,
        filterPolicy,
        mode,
        greetingPath,
        delayMin,
        delayMax,
        liepinDelayMin,
        liepinDelayMax,
        job51DelayMin,
        job51DelayMax,
        maxSent,
        liepinRunMax,
        job51RunMax,
        dailyLimit,
    liepinDailyLimit,
    job51DailyLimit,
        stopOnCaptcha,
        sendResumeAfterGreeting,
        autoResumeOnReply,
        aiGreeting,
      },
    };
  });

  const currentProfileData = useCallback((): ProfileData => {
    return buildProfileData({
      label,
      startUrl,
      rule,
      cityValues,
      educationValues,
      bossActiveValues,
      filterPolicy,
      mode,
      greetingPath,
      delayMin,
      delayMax,
      liepinDelayMin,
      liepinDelayMax,
      job51DelayMin,
      job51DelayMax,
      maxSent,
      liepinRunMax,
      job51RunMax,
      dailyLimit,
    liepinDailyLimit,
    job51DailyLimit,
      stopOnCaptcha,
      sendResumeAfterGreeting,
      autoResumeOnReply,
      aiGreeting,
    });
  }, [
    label,
    startUrl,
    rule,
    cityValues,
    educationValues,
    bossActiveValues,
    filterPolicy,
    mode,
    greetingPath,
    delayMin,
    delayMax,
    liepinDelayMin,
    liepinDelayMax,
    job51DelayMin,
    job51DelayMax,
    maxSent,
    liepinRunMax,
    job51RunMax,
    dailyLimit,
    liepinDailyLimit,
    job51DailyLimit,
    stopOnCaptcha,
    sendResumeAfterGreeting,
    autoResumeOnReply,
    aiGreeting,
  ]);

  // 返回 boolean：保存成功 true / 失败 false（新手引导用它点亮"画像已保存"一步；
  // 其余调用方（MistSettingsModal 等）原先就不消费返回值，行为零变化）。
  const saveConfig = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      // 从 ref 读最新表单值（闭包里的 greeting/values 可能是旧值，见 formValuesRef 注释）
      const latest = formValuesRef.current;
      const latestGreeting = (latest?.greeting ?? greeting).trim();
      const latestGreetingPath = (latest?.values.greetingPath ?? greetingPath).trim();
      // 画像先存（2026-10-18 审查修复：旧版先存招呼语——后端 profile_io 对
      // 空串 raise ValueError，一旦抛出 saveProfile 不执行，画像改动全部
      // 丢失。现在：①画像优先落盘；②空招呼语跳过保存（不报错）；③非空
      // 招呼语保存失败也不拖垮画像，只记提示）。
      const savedName = profileName.trim() || DEFAULT_PROFILE_NAME;
      const data = latest ? buildProfileData(latest.values) : currentProfileData();
      await ipc.saveProfile(savedName, data);
      let greetingSaved = true;
      if (latestGreeting) {
        try {
          await ipc.saveGreeting(
            latestGreeting,
            latestGreetingPath || "./greetings/default.txt",
          );
        } catch {
          greetingSaved = false;
        }
      }
      await refreshProfiles(savedName);
      setMessage(greetingSaved ? t("message.saved") : t("message.saved"));
      return true;
    } catch (err) {
      setMessage(t("message.saveFailed", { error: String(err) }));
      return false;
    } finally {
      setBusy(false);
    }
  }, [greeting, greetingPath, profileName, currentProfileData, refreshProfiles, setMessage, setBusy, t]);

  const validateBeforeRun = useCallback((): string | null => {
    // 智能兜底：姓名未填时默认求职者，不阻塞启动
    if (!usrName.trim()) {
      setUsrName("求职者");
    }
    // 智能兜底：打招呼为空时，自动使用平台高情商默认问候，绝不阻塞启动
    if (!greeting.trim()) {
      setGreeting("您好！我对贵公司的岗位非常感兴趣，希望能与您进一步沟通交流！");
    }
    if (!profileName.trim()) return t("validation.profileName");
    // 如果无包含关键词，尝试回退使用当前标签或目标岗位
    if (mode === "auto" && !rule.anyKeywords.trim() && !label.trim()) {
      return t("validation.anyKeywords");
    }
    return null;
  }, [usrName, profileName, mode, greeting, rule.anyKeywords, label, setUsrName, setGreeting, t]);

  // 初始化加载配置文件与招呼语
  useEffect(() => {
    refreshProfiles(DEFAULT_PROFILE_NAME);
    ipc
      .getGreeting()
      .then(({ path, text }) => {
        setGreetingPath(toRepoRelativePath(path));
        if (text) setGreeting(text);
      })
      .catch((err) => setMessage(t("message.greetingReadFailed", { error: String(err) })));
  }, [refreshProfiles, setMessage, t]);

  return {
    profiles,
    setProfiles,
    profileName,
    setProfileName,
    mode,
    setMode,
    usrName,
    setUsrName,
    label,
    setLabel,
    startUrl,
    setStartUrl,
    greeting,
    setGreeting,
    greetingPath,
    setGreetingPath,
    rule,
    setRule,
    cityValues,
    setCityValues,
    educationValues,
    setEducationValues,
    bossActiveValues,
    setBossActiveValues,
    filterPolicy,
    setFilterPolicy,
    delayMin,
    setDelayMin,
    delayMax,
    setDelayMax,
    liepinDelayMin,
    setLiepinDelayMin,
    liepinDelayMax,
    setLiepinDelayMax,
    job51DelayMin,
    setJob51DelayMin,
    job51DelayMax,
    setJob51DelayMax,
    maxSent,
    setMaxSent,
    liepinRunMax,
    setLiepinRunMax,
    job51RunMax,
    setJob51RunMax,
    dailyLimit,
    liepinDailyLimit,
    job51DailyLimit,
    setDailyLimit,
    setLiepinDailyLimit,
    setJob51DailyLimit,
    stopOnCaptcha,
    setStopOnCaptcha,
    sendResumeAfterGreeting,
    setSendResumeAfterGreeting,
    autoResumeOnReply,
    setAutoResumeOnReply,
    aiGreeting,
    setAiGreeting,

    refreshProfiles,
    loadProfile,
    hydrateFromProfile,
    currentProfileData,
    saveConfig,
    validateBeforeRun,
  };
}
