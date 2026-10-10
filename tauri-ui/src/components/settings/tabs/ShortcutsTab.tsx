interface ShortcutsTabProps {
  isEn: boolean;
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

export default function ShortcutsTab({ isEn }: ShortcutsTabProps) {
  return (
    <div className="space-y-3">
      <div className="divide-y divide-[var(--grid)]/70">
        <ShortcutRow keys={["Ctrl", "B"]} desc={isEn ? "Toggle Sidebar" : "展开 / 收起侧边栏"} />
        <ShortcutRow keys={["Ctrl", ","]} desc={isEn ? "Open Settings" : "打开系统设置弹窗"} />
        <ShortcutRow keys={["Enter"]} desc={isEn ? "Send message in AI chat" : "顾问对话框中直接发送"} />
        <ShortcutRow keys={["Shift", "Enter"]} desc={isEn ? "New line in chat" : "对话框中换行"} />
        <ShortcutRow keys={["Esc"]} desc={isEn ? "Close dialog or modal" : "关闭当前弹窗或菜单"} />
      </div>
    </div>
  );
}
