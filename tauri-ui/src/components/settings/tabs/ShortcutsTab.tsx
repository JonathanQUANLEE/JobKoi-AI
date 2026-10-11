import { translate, type Lang } from "../../../lib/i18n";

interface ShortcutsTabProps {
  lang: Lang;
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-stone-300 text-xs">{desc}</span>
      <div className="flex items-center gap-1 font-mono text-[11px]">
        {keys.map((k) => (
          <kbd key={k} className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-300 shadow-sm">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

export default function ShortcutsTab({ lang }: ShortcutsTabProps) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
    <div className="space-y-3">
      <div className="divide-y divide-[var(--grid)]/70">
        <ShortcutRow keys={["Ctrl", "B"]} desc={t("shortcut.toggleSidebar")} />
        <ShortcutRow keys={["Ctrl", ","]} desc={t("shortcut.openSettings")} />
        <ShortcutRow keys={["Enter"]} desc={t("shortcut.sendMessage")} />
        <ShortcutRow keys={["Shift", "Enter"]} desc={t("shortcut.newLine")} />
        <ShortcutRow keys={["Esc"]} desc={t("shortcut.closeDialog")} />
      </div>
    </div>
  );
}
