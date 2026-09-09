import { useEffect, useMemo, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { ipc, type LoadedProfile, type ProfileSummary, type ProgressEvent, type RunConfig } from "../lib/ipc";
import { LANGS, optionLabel, type Lang } from "../lib/i18n";
import {
  buildProfileData,
  toggleCsvValue,
  type FilterPolicy,
  type MatchMode,
  type Mode,
  type RuleForm,
  type Scope,
} from "../lib/profileForm";
import { eventLogLine, formatEventForDisplay } from "../lib/eventDisplay";
import { latestPayloadForJob } from "../lib/runView";
import { useRunStore, useT } from "../store";

const DEFAULT_PROFILE_NAME = "gui-default";
const DEFAULT_GREETING =
  "";

const DEFAULT_RULE: RuleForm = {
  requiredKeywords: "",
  anyKeywords: "后端开发,AI,RAG,大模型",
  excludeKeywords: "销售,客服,培训",
  scope: "title",
  match: "contains",
  caseSensitive: false,
};

const CITY_OPTIONS = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京"];
const EDUCATION_OPTIONS = ["不限", "大专", "本科", "硕士"];
const BOSS_ACTIVE_OPTIONS = ["刚刚活跃", "今日活跃", "3日内活跃", "本周活跃"];

export default function Dashboard() {
  const t = useT();
  const running = useRunStore((s) => s.running);
  const events = useRunStore((s) => s.events);
  const logs = useRunStore((s) => s.logs);
  const currentIndex = useRunStore((s) => s.currentIndex);
  const restoredStats = useRunStore((s) => s.restoredStats);
  const restoredCurrentJob = useRunStore((s) => s.restoredCurrentJob);
  const restoredLatestSkip = useRunStore((s) => s.restoredLatestSkip);
  const restoredLatestSent = useRunStore((s) => s.restoredLatestSent);
  const restoredPage = useRunStore((s) => s.restoredPage);
  const restoredPageFilters = useRunStore((s) => s.restoredPageFilters);
  const lang = useRunStore((s) => s.lang);
  const setLang = useRunStore((s) => s.setLang);
  const setRunning = useRunStore((s) => s.setRunning);
  const pushEvent = useRunStore((s) => s.pushEvent);
  const pushLog = useRunStore((s) => s.pushLog);
  const clear = useRunStore((s) => s.clear);
  const reviewPending = useRunStore((s) => s.reviewPending);
  const setReviewPending = useRunStore((s) => s.setReviewPending);
  const restoreRunState = useRunStore((s) => s.restoreRunState);

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
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("60");
  const [maxSent, setMaxSent] = useState("50");
  const [dailyLimit, setDailyLimit] = useState("80");
  const [dryRun, setDryRun] = useState(true);
  const [stopOnCaptcha, setStopOnCaptcha] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    refreshProfiles(profileName);
    ipc.getGreeting()
      .then(({ path, text }) => {
        setGreetingPath(toRepoRelativePath(path));
        if (text) setGreeting(text);
      })
      .catch((err) => setMessage(t("message.greetingReadFailed", { error: String(err) })));
    ipc.getRunState()
      .then(({ running, review, stats, current_job, latest_skip, latest_sent, page, page_filters }) => {
        setRunning(running);
        setReviewPending(review?.pending ?? null);
        restoreRunState({
          stats,
          currentJob: current_job ?? null,
          latestSkip: latest_skip ?? null,
          latestSent: latest_sent ?? null,
          page: page ?? null,
          pageFilters: page_filters ?? [],
        });
      })
      .catch(() => {});
  }, [setRunning]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs.length]);

  const eventStats = useMemo(() => summarizeEvents(events), [events]);
  const stats = events.length > 0 || !restoredStats ? eventStats : restoredStats;
  const currentJob = useMemo(() => latestJob(events) ?? restoredCurrentJob ?? undefined, [events, restoredCurrentJob]);
  const latestSkip = useMemo(
    () => latestPayloadForJob(events, "job_skipped", currentJob) ?? (events.length === 0 ? restoredLatestSkip : undefined) ?? undefined,
    [events, currentJob, restoredLatestSkip],
  );
  const latestSent = useMemo(
    () => latestPayloadForJob(events, "letter_sent", currentJob) ?? (events.length === 0 ? restoredLatestSent : undefined) ?? undefined,
    [events, currentJob, restoredLatestSent],
  );
  const pageState = useMemo(() => latestPayload(events, "page_opened") ?? restoredPage ?? undefined, [events, restoredPage]);
  const pageFilterStates = useMemo(() => {
    const current = events.filter((event) => event.kind === "page_filter").map((event) => event.payload);
    return current.length > 0 ? current : restoredPageFilters;
  }, [events, restoredPageFilters]);

  const statusText = running
    ? currentIndex
      ? t("status.runningIndex", { index: currentIndex })
      : t("status.starting")
    : t("status.idle");

  async function refreshProfiles(preferredName?: string) {
    try {
      const result = await ipc.listProfiles();
      setProfiles(result.profiles);
      const nextName =
        preferredName && result.profiles.some((item) => item.name === preferredName)
          ? preferredName
          : result.profiles.some((item) => item.name === DEFAULT_PROFILE_NAME)
            ? DEFAULT_PROFILE_NAME
            : result.profiles[0]?.name;
      if (nextName) {
        setProfileName(nextName);
        await loadProfile(nextName);
      }
    } catch (err) {
      setMessage(t("message.profileReadFailed", { error: String(err) }));
    }
  }

  async function loadProfile(name: string) {
    try {
      const profile = await ipc.getProfile(name);
      hydrateFromProfile(profile);
    } catch (err) {
      setMessage(t("message.profileLoadFailed", { error: String(err) }));
    }
  }

  function hydrateFromProfile(profile: LoadedProfile) {
    const data = profile.data;
    const search = asRecord(data.search);
    const filters = asRecord(asRecord(data.filters).title);
    const required = asRecord(filters.required);
    const any = asRecord(filters.any);
    const exclude = asRecord(filters.exclude);
    const send = asRecord(data.send);
    const pageFilters = asRecord(data.page_filters);

    setLabel(asString(search.query, label));
    setStartUrl(asString(search.start_url, startUrl));
    setMode(asMode(send.mode, mode));
    setGreetingPath(asString(send.greeting_file, greetingPath));
    setDelayMin(asString(send.delay_min, delayMin));
    setDelayMax(asString(send.delay_max, delayMax));
    setMaxSent(asString(send.max_sent, maxSent));
    setDailyLimit(asString(send.daily_sent_limit, dailyLimit));
    setStopOnCaptcha(asBool(send.stop_on_captcha, stopOnCaptcha));
    setRule({
      requiredKeywords: joinKeywords(required.keywords, rule.requiredKeywords),
      anyKeywords: joinKeywords(any.keywords, rule.anyKeywords),
      excludeKeywords: joinKeywords(exclude.keywords, rule.excludeKeywords),
      scope: asScope(required.scope || any.scope || exclude.scope, rule.scope),
      match: asMatchMode(required.match || any.match || exclude.match, rule.match),
      caseSensitive: asBool(required.case_sensitive, rule.caseSensitive),
    });
    setFilterPolicy(pageFilters.strict === true ? "strict" : "warning");
    setCityValues(joinKeywords(asRecord(pageFilters.city).values, cityValues));
    setEducationValues(joinKeywords(asRecord(pageFilters.education).values, educationValues));
    setBossActiveValues(joinKeywords(asRecord(pageFilters.boss_active).values, bossActiveValues));
  }

  function currentProfileData() {
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
    });
  }

  async function saveConfig() {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.saveGreeting(greeting.trim(), greetingPath.trim() || "./greetings/default.txt");
      const savedName = profileName.trim() || DEFAULT_PROFILE_NAME;
      await ipc.saveProfile(savedName, currentProfileData());
      await refreshProfiles(savedName);
      setMessage(t("message.saved"));
    } catch (err) {
      setMessage(t("message.saveFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  function validateBeforeRun(): string | null {
    if (!usrName.trim()) return t("validation.userName");
    if (!profileName.trim()) return t("validation.profileName");
    if ((mode === "review" || mode === "auto") && !greeting.trim()) return t("validation.greeting");
    if (mode === "auto" && !rule.anyKeywords.trim()) return t("validation.anyKeywords");
    return null;
  }

  async function startRun() {
    const error = validateBeforeRun();
    if (error) {
      setMessage(error);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await ipc.saveGreeting(greeting.trim(), greetingPath.trim() || "./greetings/default.txt");
      await ipc.saveProfile(profileName.trim(), currentProfileData());
      clear();
      setRunning(true);
      const progressChannel = new Channel<ProgressEvent>((ev) => {
        const timestamp = ev.ts_local || formatLocalTime();
        const event = { ...ev, ts_local: timestamp };
        pushEvent(event);
        pushLog(eventLogLine(event, timestamp));
      });
      const logChannel = new Channel<string>((line) => pushLog(`${formatLocalTime()} ${line}`));
      const config: RunConfig = {
        usrName: usrName.trim(),
        label: label.trim(),
        dryRun,
        profile: profileName.trim(),
        useCurrentPage: true,
      };
      await ipc.startRun(config, progressChannel, logChannel);
    } catch (err) {
      setRunning(false);
      pushLog(`${formatLocalTime()} ${t("message.startFailed", { error: String(err) })}`);
      setMessage(t("message.startFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function stopRun() {
    setBusy(true);
    try {
      await ipc.stopRun();
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.stopFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetChrome() {
    setBusy(true);
    try {
      await ipc.shutdownBrowser();
      pushLog(`${formatLocalTime()} ${t("message.browserClosed")}`);
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.browserCloseFailed", { error: String(err) })}`);
    } finally {
      setBusy(false);
    }
  }

  async function openManualBrowser() {
    setBusy(true);
    setMessage(null);
    try {
      const state = await ipc.openManualBrowser();
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpened")} ${state.url || ""}`.trim());
      setMessage(t("message.manualBrowserOpened"));
    } catch (err) {
      pushLog(`${formatLocalTime()} ${t("message.manualBrowserOpenFailed", { error: String(err) })}`);
      setMessage(t("message.manualBrowserOpenFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      setMessage(t("message.logsCopied"));
    } catch {
      setMessage(t("message.logsCopyFailed"));
    }
  }

  async function submitReviewDecision(decision: "send" | "skip" | "quit") {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.submitReviewDecision(decision);
      setMessage(
        decision === "send" ? t("message.reviewSend") : decision === "skip" ? t("message.reviewSkip") : t("message.reviewQuit"),
      );
    } catch (err) {
      setMessage(t("message.reviewSubmitFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="border-b border-[var(--grid)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-wide">Bosszhipin Job Bot</h1>
            <p className="mt-1 text-xs text-[var(--muted-fg)]">{t("appSubtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={lang}
              onChange={(event) => {
                const next = event.target.value as Lang;
                setLang(next);
              }}
              className="field-select w-28"
              aria-label={t("a11y.language")}
            >
              {LANGS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className={running ? "status-on" : "status-idle"}>{statusText}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-5">
          <Panel title={t("panel.profile")}>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <Field label={t("field.currentProfile")}>
                <select
                  className="field-select"
                  value={profileName}
                  onChange={(event) => {
                    const next = event.target.value;
                    setProfileName(next);
                    loadProfile(next);
                  }}
                >
                  {profiles.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                  {!profiles.some((item) => item.name === profileName) && (
                    <option value={profileName}>{profileName}</option>
                  )}
                </select>
              </Field>
              <Field label={t("field.profileName")}>
                <input
                  className="field-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="gui-default"
                />
              </Field>
            </div>
          </Panel>

          <Panel title={t("panel.mode")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <ModeButton active={mode === "scan"} title={t("mode.scan.title")} desc={t("mode.scan.desc")} onClick={() => setMode("scan")} />
              <ModeButton active={mode === "review"} title={t("mode.review.title")} desc={t("mode.review.desc")} onClick={() => setMode("review")} />
              <ModeButton active={mode === "auto"} title={t("mode.auto.title")} desc={t("mode.auto.desc")} onClick={() => setMode("auto")} />
            </div>
            {mode === "auto" && (
              <div className="risk-box">
                {t("warning.auto")}
              </div>
            )}
          </Panel>

          <Panel title={t("panel.basic")}>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t("field.userName")}>
                <input className="field-input" value={usrName} onChange={(e) => setUsrName(e.target.value)} placeholder={t("placeholder.userName")} />
              </Field>
              <Field label={t("field.searchKeyword")}>
                <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("placeholder.searchKeyword")} />
              </Field>
              <Field label={t("field.startUrl")}>
                <input className="field-input" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder={t("placeholder.startUrl")} />
              </Field>
            </div>
          </Panel>

          <Panel title={t("panel.rules")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("field.requiredKeywords")}>
                <input className="field-input" value={rule.requiredKeywords} onChange={(e) => setRule({ ...rule, requiredKeywords: e.target.value })} placeholder={t("placeholder.requiredKeywords")} />
              </Field>
              <Field label={t("field.anyKeywords")}>
                <input className="field-input" value={rule.anyKeywords} onChange={(e) => setRule({ ...rule, anyKeywords: e.target.value })} placeholder={t("placeholder.anyKeywords")} />
              </Field>
              <Field label={t("field.excludeKeywords")}>
                <input className="field-input" value={rule.excludeKeywords} onChange={(e) => setRule({ ...rule, excludeKeywords: e.target.value })} placeholder={t("placeholder.excludeKeywords")} />
              </Field>
              <Field label={t("field.scope")}>
                <select className="field-select" value={rule.scope} onChange={(e) => setRule({ ...rule, scope: e.target.value as Scope })}>
                  <option value="title">{optionLabel(lang, "scope.title")}</option>
                  <option value="description">{optionLabel(lang, "scope.description")}</option>
                  <option value="title_description">{optionLabel(lang, "scope.title_description")}</option>
                  <option value="location">{optionLabel(lang, "scope.location")}</option>
                  <option value="all">{optionLabel(lang, "scope.all")}</option>
                </select>
              </Field>
              <Field label={t("field.match")}>
                <select className="field-select" value={rule.match} onChange={(e) => setRule({ ...rule, match: e.target.value as MatchMode })}>
                  <option value="contains">{optionLabel(lang, "match.contains")}</option>
                  <option value="regex">{optionLabel(lang, "match.regex")}</option>
                  <option value="exact">{optionLabel(lang, "match.exact")}</option>
                </select>
              </Field>
              <label className="checkbox-line self-end pb-2">
                <input type="checkbox" checked={rule.caseSensitive} onChange={(e) => setRule({ ...rule, caseSensitive: e.target.checked })} />
                <span>{t("field.caseSensitive")}</span>
              </label>
            </div>
          </Panel>

          <Panel title={t("panel.pageFilters")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("field.city")}>
                <OptionPicker
                  value={cityValues}
                  options={CITY_OPTIONS}
                  onChange={setCityValues}
                />
                <input className="field-input" value={cityValues} onChange={(e) => setCityValues(e.target.value)} placeholder={t("placeholder.city")} />
              </Field>
              <Field label={t("field.education")}>
                <OptionPicker
                  value={educationValues}
                  options={EDUCATION_OPTIONS}
                  onChange={setEducationValues}
                />
                <input className="field-input" value={educationValues} onChange={(e) => setEducationValues(e.target.value)} placeholder={t("placeholder.education")} />
              </Field>
              <Field label={t("field.bossActive")}>
                <OptionPicker
                  value={bossActiveValues}
                  options={BOSS_ACTIVE_OPTIONS}
                  onChange={setBossActiveValues}
                />
                <input className="field-input" value={bossActiveValues} onChange={(e) => setBossActiveValues(e.target.value)} placeholder={t("placeholder.bossActive")} />
              </Field>
              <Field label={t("field.filterPolicy")}>
                <select className="field-select" value={filterPolicy} onChange={(e) => setFilterPolicy(e.target.value as FilterPolicy)}>
                  <option value="warning">{t("filter.warning")}</option>
                  <option value="strict">{t("filter.strict")}</option>
                </select>
              </Field>
            </div>
          </Panel>

          <Panel title={t("panel.greeting")}>
            <Field label={t("field.greetingFile")}>
              <input className="field-input" value={greetingPath} onChange={(e) => setGreetingPath(e.target.value)} placeholder="./greetings/default.txt" />
            </Field>
            <textarea
              className="field-textarea mt-4 min-h-40"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder={t("placeholder.greeting")}
            />
          </Panel>

          <Panel title={t("panel.sendPolicy")}>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label={t("field.delayMin")}>
                <input className="field-input" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label={t("field.delayMax")}>
                <input className="field-input" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label={t("field.maxSent")}>
                <input className="field-input" value={maxSent} onChange={(e) => setMaxSent(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label={t("field.dailyLimit")}>
                <input className="field-input" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="checkbox-line">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                <span>{t("toggle.dryRun")}</span>
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={stopOnCaptcha} onChange={(e) => setStopOnCaptcha(e.target.checked)} />
                <span>{t("toggle.stopCaptcha")}</span>
              </label>
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={startRun} disabled={running || busy}>{t("button.start")}</button>
            <button className="btn-secondary" onClick={stopRun} disabled={!running || busy}>{t("button.stop")}</button>
            <button className="btn-secondary" onClick={saveConfig} disabled={busy}>{t("button.saveProfile")}</button>
            <button className="btn-secondary" onClick={openManualBrowser} disabled={running || busy}>{t("button.openManualBrowser")}</button>
            <button className="btn-ghost" onClick={resetChrome} disabled={running || busy}>{t("button.resetBrowser")}</button>
            {message && <span className="message-line">{message}</span>}
          </div>
        </section>

        <aside className="space-y-5">
          {reviewPending && (
            <Panel title={t("panel.review")}>
              <ReviewCard
                pending={reviewPending}
                busy={busy}
                onDecision={submitReviewDecision}
                t={t}
              />
            </Panel>
          )}

          <Panel title={t("panel.run")}>
            <div className="stat-grid">
              <Stat label={t("stat.browser")} value={running ? t("status.running") : t("status.idle")} />
              <Stat label={t("stat.scanned")} value={stats.scanned} />
              <Stat label={t("stat.sent")} value={stats.sent} />
              <Stat label={t("stat.skipped")} value={stats.skipped} />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <InfoLine label={t("info.currentJob")} value={formatJobLine(currentJob)} />
              <InfoLine label={t("info.requestUrl")} value={asString(pageState?.requested_url, "-")} />
              <InfoLine label={t("info.actualUrl")} value={asString(pageState?.actual_url, "-")} />
              <InfoLine label={t("info.urlStatus")} value={pageState?.redirected ? t("url.redirected") : t("url.notRedirected")} />
              <InfoLine label={t("info.matchReason")} value={asString(currentJob?.match_reason || currentJob?.reason || latestSent?.match_explanation || latestSkip?.detail, "-")} />
              <InfoLine label={t("info.skipReason")} value={asString(latestSkip?.detail || latestSkip?.reason, "-")} />
              <InfoLine label={t("info.sendStatus")} value={asString(latestSent?.status, "-")} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <span className="field-label">{t("info.pageFilterResult")}</span>
              {pageFilterStates.length === 0 ? (
                <p className="empty-text">{t("empty.pageFilters")}</p>
              ) : (
                pageFilterStates.map((item, index) => (
                  <div key={index} className={item.status === "failed" ? "event-row error" : "event-row"}>
                    <span className="event-kind">{asString(item.status, "-")}</span>
                    <span className="event-payload">{asString(item.message, "-")}</span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title={t("panel.events")}>
            <div className="event-list">
              {events.length === 0 ? (
                <p className="empty-text">{t("empty.events")}</p>
              ) : (
                events.slice(-80).map((event, index) => <EventRow key={`${event.kind}-${index}`} event={event} />)
              )}
            </div>
          </Panel>
          <Panel title={t("panel.logs")}>
            <pre ref={logRef} className="log-box">{logs.length ? logs.join("\n") : t("empty.logs")}</pre>
            <div className="mt-3 flex flex-wrap gap-3">
              <button className="btn-secondary" onClick={copyLogs}>{t("button.copyLogs")}</button>
            </div>
          </Panel>
        </aside>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">{title}</div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function ModeButton({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={active ? "mode-button active" : "mode-button"}>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-[var(--muted-fg)]">{desc}</span>
    </button>
  );
}

function OptionPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const selected = value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    <div className="option-picker">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={selected.includes(option) ? "option-chip active" : "option-chip"}
          onClick={() => onChange(toggleCsvValue(value, option))}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-cell">
      <span className="field-label">{label}</span>
      <span className="text-lg font-semibold text-[var(--signal)]">{value}</span>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 border-b border-[var(--grid)] pb-2">
      <span className="text-xs text-[var(--muted-fg)]">{label}</span>
      <span className="break-words text-[var(--ink)]">{value}</span>
    </div>
  );
}

function EventRow({ event }: { event: ProgressEvent }) {
  const display = formatEventForDisplay(event, formatLocalTime());
  return (
    <div className={`event-row ${display.severity}`}>
      <div className="event-meta">
        <span className="event-time">{display.time || "-"}</span>
        <span className="event-title">{display.title}</span>
      </div>
      <div className="event-body">
        <span className="event-summary">{display.summary}</span>
        {display.details && <span className="event-details">{display.details}</span>}
      </div>
    </div>
  );
}

function ReviewCard({
  pending,
  busy,
  onDecision,
  t,
}: {
  pending: Record<string, unknown>;
  busy: boolean;
  onDecision: (decision: "send" | "skip" | "quit") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const job = asRecord(pending.job);
  const details = asRecord(pending.details);
  return (
    <div className="space-y-3">
      <div className="review-title">{formatJobLine(job)}</div>
      <InfoLine label={t("review.matchInfo")} value={asString(details.reason, "-")} />
      <InfoLine label={t("review.jobDetail")} value={asString(pending.job_description, "-")} />
      <div>
        <span className="field-label">{t("review.greeting")}</span>
        <pre className="review-greeting">{asString(pending.greeting, "")}</pre>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-primary" onClick={() => onDecision("send")} disabled={busy}>{t("button.send")}</button>
        <button className="btn-secondary" onClick={() => onDecision("skip")} disabled={busy}>{t("button.skip")}</button>
        <button className="btn-ghost" onClick={() => onDecision("quit")} disabled={busy}>{t("button.stop")}</button>
      </div>
    </div>
  );
}

function joinKeywords(value: unknown, fallback: string) {
  return Array.isArray(value) ? value.map(String).join(",") : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asMode(value: unknown, fallback: Mode): Mode {
  return value === "scan" || value === "review" || value === "auto" ? value : fallback;
}

function asScope(value: unknown, fallback: Scope): Scope {
  return value === "title" || value === "description" || value === "title_description" || value === "location" || value === "all" ? value : fallback;
}

function asMatchMode(value: unknown, fallback: MatchMode): MatchMode {
  return value === "contains" || value === "regex" || value === "exact" ? value : fallback;
}

function latestPayload(events: ProgressEvent[], kind: ProgressEvent["kind"]) {
  return [...events].reverse().find((event) => event.kind === kind)?.payload;
}

function latestJob(events: ProgressEvent[]) {
  return [...events].reverse().find((event) => event.kind === "job_found")?.payload;
}

function summarizeEvents(events: ProgressEvent[]) {
  return events.reduce(
    (acc, event) => {
      if (event.kind === "job_found") acc.scanned += 1;
      if (event.kind === "job_skipped") acc.skipped += 1;
      if (event.kind === "letter_sent" && event.payload.status === "sent") acc.sent += 1;
      return acc;
    },
    { scanned: 0, skipped: 0, sent: 0 },
  );
}

function formatJobLine(payload: Record<string, unknown> | undefined) {
  if (!payload) return "-";
  const title = asString(payload.title, "");
  const company = asString(payload.company, "");
  const location = asString(payload.location, "");
  return [title, company, location].filter(Boolean).join(" / ") || "-";
}

function toRepoRelativePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^.*?\/greetings\//, "./greetings/");
}

function formatLocalTime() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
