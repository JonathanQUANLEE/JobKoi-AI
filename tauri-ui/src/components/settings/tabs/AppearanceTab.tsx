import { Sparkles, Contrast, Laptop, Languages, Check } from "lucide-react";
import { LANGS, type Lang } from "../../../lib/i18n";

interface AppearanceTabProps {
  isEn: boolean;
  appTheme: string;
  setAppTheme: (t: "classic" | "monochrome" | "system") => void;
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  isMonochrome: boolean;
}

export default function AppearanceTab({
  isEn,
  appTheme,
  setAppTheme,
  lang,
  onSetLang,
  isMonochrome,
}: AppearanceTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="block text-[var(--muted-fg)] text-[11px] font-semibold tracking-wide uppercase">
            {isEn ? "Interface Theme" : "界面显示主题"}
          </label>
          <span className="text-[10px] text-stone-500">
            {isEn ? "Instant preview & auto-saved" : "即时切换 · 自动保存"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* 1. 经典黑金 (默认) */}
          <button
            type="button"
            onClick={() => setAppTheme("classic")}
            className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
              appTheme === "classic"
                ? "border-amber-500/80 bg-amber-500/10 text-amber-300 font-bold shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
                : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-amber-500/40 hover:bg-[var(--panel-hover)]"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
                <Sparkles className="size-4" />
              </div>
              {appTheme === "classic" ? (
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="size-3" />
                  <span>{isEn ? "Active" : "当前使用"}</span>
                </span>
              ) : (
                <span className="text-[10px] text-amber-400/60 font-mono">Default</span>
              )}
            </div>

            <div>
              <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                <span>{isEn ? "Classic Warm Amber" : "经典黑金"}</span>
                <span className="text-[10px] font-normal text-amber-400/80">
                  {isEn ? "(Default)" : "(默认)"}
                </span>
              </div>
              <div className="text-[10px] text-stone-400 mt-1 leading-relaxed">
                {isEn
                  ? "Warm dark tone, amber cyber glow, geek cockpit aesthetic"
                  : "沉浸暖黑底色 · 金琥珀微光 · 经典极客质感"}
              </div>
            </div>

            {/* 视觉调色板微缩胶囊 */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
              <span className="h-2 w-6 rounded-full bg-[#141210] border border-amber-500/40" />
              <span className="h-2 w-4 rounded-full bg-amber-500" />
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
          </button>

          {/* 2. 黑白高级感 */}
          <button
            type="button"
            onClick={() => setAppTheme("monochrome")}
            className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
              appTheme === "monochrome"
                ? "border-white/90 bg-white/10 text-white font-bold shadow-xl shadow-white/10 ring-1 ring-white/40"
                : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-white/40 hover:bg-[var(--panel-hover)]"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="p-2 rounded-xl bg-white/15 text-white border border-white/30 group-hover:scale-105 transition-transform">
                <Contrast className="size-4" />
              </div>
              {appTheme === "monochrome" ? (
                <span className="text-[10px] font-semibold text-black bg-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <Check className="size-3" />
                  <span>{isEn ? "Active" : "当前使用"}</span>
                </span>
              ) : (
                <span className="text-[9px] font-semibold bg-white/10 text-zinc-300 px-1.5 py-0.2 rounded border border-white/20">
                  Luxe
                </span>
              )}
            </div>

            <div>
              <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                <span>{isEn ? "Monochrome Luxe" : "黑白高级感"}</span>
                <span className="text-[9px] font-semibold bg-white text-black px-1.5 py-0.2 rounded">
                  高奢
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
                {isEn
                  ? "Deep obsidian black, zinc silver tiers, high-contrast PillNav invert"
                  : "纯粹极夜曜黑 · 钛银灰阶 · 高反差 PillNav 翻转"}
              </div>
            </div>

            {/* 视觉调色板微缩胶囊 */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
              <span className="h-2 w-6 rounded-full bg-black border border-white/40" />
              <span className="h-2 w-4 rounded-full bg-white" />
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
            </div>
          </button>

          {/* 3. 跟随系统 */}
          <button
            type="button"
            onClick={() => setAppTheme("system")}
            className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 transition-all cursor-pointer relative overflow-hidden group text-left ${
              appTheme === "system"
                ? "border-cyan-500/80 bg-cyan-500/10 text-cyan-300 font-bold shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30"
                : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:border-cyan-500/40 hover:bg-[var(--panel-hover)]"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 group-hover:scale-105 transition-transform">
                <Laptop className="size-4" />
              </div>
              {appTheme === "system" ? (
                <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="size-3" />
                  <span>{isEn ? "Active" : "当前使用"}</span>
                </span>
              ) : (
                <span className="text-[10px] text-cyan-400/60 font-mono">Auto</span>
              )}
            </div>

            <div>
              <div className="text-xs font-bold text-stone-100 flex items-center gap-1.5">
                <span>{isEn ? "System Adaptive" : "跟随系统"}</span>
              </div>
              <div className="text-[10px] text-stone-400 mt-1 leading-relaxed">
                {isEn
                  ? "Adapt automatically according to OS dark/contrast appearance"
                  : "自适应检测系统深色与高对比外观模式"}
              </div>
            </div>

            {/* 视觉调色板微缩胶囊 */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--grid)]/60 w-full">
              <span className="h-2 w-6 rounded-full bg-stone-900 border border-cyan-500/40" />
              <span className="h-2 w-4 rounded-full bg-cyan-400" />
              <span className="h-2 w-2 rounded-full bg-stone-500" />
            </div>
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--grid)]">
        <label className="block text-[var(--muted-fg)] text-[11px] mb-2 font-semibold tracking-wide uppercase flex items-center gap-1.5">
          <Languages className="size-3.5 text-[var(--muted-fg)]" />
          <span>{isEn ? "System Language" : "系统显示语言 (Language)"}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {LANGS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onSetLang(item.value)}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                lang === item.value
                  ? isMonochrome
                    ? "border-white/80 bg-white/10 text-white font-bold"
                    : "border-amber-500/70 bg-amber-500/10 text-amber-300 font-bold"
                  : "border-[var(--grid)] bg-[var(--panel-2)] text-[var(--muted-fg)] hover:text-white hover:bg-[var(--panel-hover)]"
              }`}
            >
              <span className="text-xs">{item.label}</span>
              {lang === item.value && (
                <Check className={`size-3.5 ${isMonochrome ? "text-white" : "text-amber-400"}`} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
