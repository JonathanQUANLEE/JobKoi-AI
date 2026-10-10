import type { DragEvent } from "react";
import {
  Layers,
  RefreshCw,
  UploadCloud,
  Trash2,
  ShieldAlert,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
} from "lucide-react";
import type { ResumeItem } from "../../lib/ipc";
import { formatSize, isImageExt } from "../../lib/resumeUtils";
import { MagicCard } from "../core/MagicBento";

interface ResumeSidebarProps {
  resumes: ResumeItem[];
  selectedName: string | null;
  busy: boolean;
  isDragging: boolean;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onSelect: (name: string, index: number) => void;
  onDelete: (name: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

export default function ResumeSidebar({
  resumes,
  selectedName,
  busy,
  isDragging,
  onRefresh,
  onOpenUpload,
  onSelect,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
}: ResumeSidebarProps) {
  return (
    <div className="w-full lg:w-72 shrink-0 space-y-3">
      {/* 1. 资料资产档案便当盒 */}
      <MagicCard
        className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-3.5 shadow-sm space-y-3"
        glowColor="245, 158, 11"
        enableTilt={false}
      >
        {/* 顶栏：标题 + 刷新 + 上传按钮 */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[var(--grid)]">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              资料档案 ({resumes.length})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="p-1 rounded-lg border border-[var(--grid)] hover:border-amber-500/40 text-stone-400 hover:text-stone-200 cursor-pointer"
              onClick={onRefresh}
              disabled={busy}
              title="刷新文件列表"
            >
              <RefreshCw className={`size-3 ${busy ? "animate-spin text-amber-400" : ""}`} />
            </button>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] py-1 px-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold hover:from-amber-400 hover:to-amber-500 shadow-sm cursor-pointer active:scale-95 transition-all"
              onClick={onOpenUpload}
              disabled={busy}
            >
              <UploadCloud className="size-3" />
              <span>上传 +</span>
            </button>
          </div>
        </div>

        {/* 紧凑拖拽入库框 */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onOpenUpload}
          className={`rounded-xl border border-dashed p-2.5 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-amber-400 bg-amber-500/15"
              : "border-[var(--grid)] bg-[var(--panel-2)]/30 hover:border-amber-500/40 hover:bg-[var(--panel-hover)]"
          }`}
        >
          <UploadCloud className="mx-auto size-4 text-stone-400 mb-1" />
          <p className="text-[11px] font-medium text-stone-300">点击或拖拽文件入库</p>
          <p className="text-[9px] text-stone-500 mt-0.5">支持 PDF、Word、图片证明材料</p>
        </div>

        {/* 紧凑资料档案列表 (联动高亮当前 3D 舞台最前方的卡片) */}
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
          {resumes.length === 0 ? (
            <div className="text-center py-6 text-stone-500 text-xs">
              暂无资料，请点击上方按钮入库
            </div>
          ) : (
            resumes.map((item, idx) => {
              const isFront = item.name === selectedName;
              return (
                <div
                  key={item.name}
                  onClick={() => onSelect(item.name, idx)}
                  className={`group flex items-center justify-between p-2 rounded-xl text-xs transition-all cursor-pointer select-none border ${
                    isFront
                      ? "bg-amber-500/15 border-amber-500/60 text-amber-200 shadow-sm shadow-amber-500/10 font-semibold"
                      : "bg-stone-900/60 border-stone-800/80 text-stone-400 hover:text-stone-200 hover:border-stone-700"
                  }`}
                  title={`点击在 3D 抽屉中将 ${item.name} 抽至最前`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isImageExt(item.name) ? (
                      <ImageIcon className="size-3.5 text-purple-400 shrink-0" />
                    ) : item.name.endsWith(".pdf") ? (
                      <FileText className="size-3.5 text-red-400 shrink-0" />
                    ) : (
                      <FileSpreadsheet className="size-3.5 text-blue-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-xs max-w-[130px]">{item.name}</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        {formatSize(item.size)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.is_default && (
                      <span className="text-[10px] text-amber-400 font-bold px-1.5 py-0.2 rounded bg-amber-500/20">
                        默认
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-red-500/10 text-stone-500 rounded-lg transition-all cursor-pointer"
                      title="移出资料库"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </MagicCard>

      {/* 2. 紧凑型平台投递风控机制说明小卡片 */}
      <MagicCard
        className="rounded-2xl border border-amber-500/20 bg-stone-900/70 p-3.5 text-xs text-stone-300 space-y-2 shadow-sm"
        glowColor="245, 158, 11"
        enableTilt={false}
      >
        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
          <ShieldAlert className="size-3.5 shrink-0" />
          <span>平台投递风控机制规范</span>
        </div>
        <p className="text-[10px] text-stone-400 leading-relaxed">
          BOSS直聘等主流平台严禁初次会话灌输附件文件：
        </p>
        <div className="space-y-1 pt-1 border-t border-stone-800/80 text-[10px] text-stone-300">
          <p>1. <strong>初次触达</strong>：真诚打招呼，HR 查看在线微简历；</p>
          <p>2. <strong>意向产生</strong>：HR 回复表达意向后，系统方可合规发起发送附件；</p>
          <p>3. <strong>本地私密</strong>：文件保存在本地沙箱，保障账号长期安全。</p>
        </div>
      </MagicCard>
    </div>
  );
}
