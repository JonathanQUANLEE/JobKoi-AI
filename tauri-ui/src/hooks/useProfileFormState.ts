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
  maxSent: string;
  setMaxSent: Dispatch<SetStateAction<string>>;
  dailyLimit: string;
  setDailyLimit: Dispatch<SetStateAction<string>>;
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
  saveConfig: () => Promise<void>;
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
  const [label, setLabel] = useState("后端开发实习");
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
  const [maxSent, setMaxSent] = useState("50");
  const [dailyLimit, setDailyLimit] = useState("80");
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
    setMaxSent((prev) => asString(send.max_sent, prev));
    setDailyLimit((prev) => asString(send.daily_sent_limit, prev));
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
        maxSent,
        dailyLimit,
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
      maxSent,
      dailyLimit,
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
    maxSent,
    dailyLimit,
    stopOnCaptcha,
    sendResumeAfterGreeting,
    autoResumeOnReply,
    aiGreeting,
  ]);

  const saveConfig = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      // 从 ref 读最新表单值（闭包里的 greeting/values 可能是旧值，见 formValuesRef 注释）
      const latest = formValuesRef.current;
      const latestGreeting = (latest?.greeting ?? greeting).trim();
      const latestGreetingPath = (latest?.values.greetingPath ?? greetingPath).trim();
      await ipc.saveGreeting(
        latestGreeting,
        latestGreetingPath || "./greetings/default.txt",
      );
      const savedName = profileName.trim() || DEFAULT_PROFILE_NAME;
      const data = latest ? buildProfileData(latest.values) : currentProfileData();
      await ipc.saveProfile(savedName, data);
      await refreshProfiles(savedName);
      setMessage(t("message.saved"));
    } catch (err) {
      setMessage(t("message.saveFailed", { error: String(err) }));
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
    maxSent,
    setMaxSent,
    dailyLimit,
    setDailyLimit,
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
