import { useT } from "../../../store";

interface DrawerGreetingTabProps {
  greetingPath: string;
  setGreetingPath: (v: string) => void;
  greeting: string;
  setGreeting: (v: string) => void;
  aiGreeting: boolean;
  setAiGreeting: (v: boolean) => void;
}

export default function DrawerGreetingTab({
  greetingPath,
  setGreetingPath,
  greeting,
  setGreeting,
  aiGreeting,
  setAiGreeting,
}: DrawerGreetingTabProps) {
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">固定打招呼模板</h3>
          <label className="checkbox-line text-xs">
            <input
              type="checkbox"
              checked={aiGreeting}
              onChange={(e) => setAiGreeting(e.target.checked)}
            />
            <span className="text-amber-400 font-semibold">{t("toggle.aiGreeting")}</span>
          </label>
        </div>
        <div>
          <label className="field-label">{t("field.greetingFile")}</label>
          <input
            className="field-input"
            value={greetingPath}
            onChange={(e) => setGreetingPath(e.target.value)}
            placeholder="./greetings/default.txt"
          />
        </div>
        <div>
          <label className="field-label">招呼语内容（支持就地修改）</label>
          <textarea
            className="field-textarea min-h-52 text-xs"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder={t("placeholder.greeting")}
          />
        </div>
      </div>
    </div>
  );
}
