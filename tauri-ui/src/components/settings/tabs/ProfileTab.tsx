import { FileText, ExternalLink, Check, Save } from "lucide-react";

interface ProfileTabProps {
  usrName: string;
  setUsrName: (name: string) => void;
  label: string;
  defaultResumeName: string;
  isMonochrome: boolean;
  busy: boolean;
  savedSuccess: boolean;
  onClose: () => void;
  onGoToResumes: () => void;
  onSaveAll: () => Promise<void>;
}

export default function ProfileTab({
  usrName,
  setUsrName,
  label,
  defaultResumeName,
  isMonochrome,
  busy,
  savedSuccess,
  onClose,
  onGoToResumes,
  onSaveAll,
}: ProfileTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          您的称呼 / 昵称
        </label>
        <input
          type="text"
          value={usrName}
          onChange={(e) => setUsrName(e.target.value)}
          placeholder="例如：小李 / Alex"
          className="w-full rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] px-3 py-2 text-xs text-stone-100 placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
        />
        <p className="text-[10px] text-stone-500 mt-1">仅存储在本地设备，用于打招呼时称呼与会话归档</p>
      </div>

      <div>
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          当前主要求职目标
        </label>
        <input
          type="text"
          disabled
          value={label || "尚未在工作台指定岗位"}
          className="w-full rounded-xl border border-[var(--grid)] bg-stone-900/40 px-3 py-2 text-xs text-stone-400 opacity-80"
        />
        <p className="text-[10px] text-stone-500 mt-1">可在工作台或求职画像中随时与大模型更新</p>
      </div>

      <div className="pt-2 border-t border-[var(--grid)]">
        <label className="block text-stone-400 text-[11px] mb-1 font-medium">
          默认投递简历文件
        </label>
        <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className={`size-4 shrink-0 ${isMonochrome ? "text-zinc-300" : "text-amber-400"}`} />
            <span className="font-medium text-stone-200 truncate">{defaultResumeName}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onGoToResumes();
            }}
            className={`hover:underline flex items-center gap-1 text-[11px] shrink-0 ml-2 cursor-pointer ${
              isMonochrome ? "text-zinc-300 hover:text-white" : "text-amber-400"
            }`}
          >
            <span>前往简历库更换</span>
            <ExternalLink className="size-3" />
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--grid)] flex justify-end">
        <button
          type="button"
          onClick={onSaveAll}
          disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
            isMonochrome
              ? "bg-white hover:bg-zinc-200 text-black shadow-md shadow-white/10"
              : "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/20"
          }`}
        >
          {savedSuccess ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
          <span>{savedSuccess ? "已保存" : "保存信息"}</span>
        </button>
      </div>
    </div>
  );
}
