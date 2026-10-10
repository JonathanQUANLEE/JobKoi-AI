import {
  FileText,
  RefreshCw,
  Star,
  Trash2,
  Sparkles,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize,
  Layers,
  LayoutGrid,
  Image as ImageIcon,
} from "lucide-react";
import type { ResumeItem, ResumeContentResult } from "../../lib/ipc";
import { formatSize, getExtension, isImageExt } from "../../lib/resumeUtils";
import HoldButton from "../core/HoldButton";

interface ResumeCardViewerProps {
  item: ResumeItem;
  isFlat?: boolean;
  content?: ResumeContentResult;
  blobUrl?: string;
  isReadingMode: boolean;
  isMonochrome: boolean;
  busy: boolean;
  imgZoom: number;
  setImgZoom: React.Dispatch<React.SetStateAction<number>>;
  onSetReadingMode: (val: boolean) => void;
  onOpenNative: (name: string) => void;
  onExtractProfile?: (name: string, text?: string) => void;
  onReviewResume?: (name: string, text?: string) => void;
  onSetDefault: (name: string) => void;
  onDeleteConfirmed: (name: string) => void;
}

export default function ResumeCardViewer({
  item,
  isFlat = false,
  content,
  blobUrl,
  isReadingMode,
  isMonochrome,
  busy,
  imgZoom,
  setImgZoom,
  onSetReadingMode,
  onOpenNative,
  onExtractProfile,
  onReviewResume,
  onSetDefault,
  onDeleteConfirmed,
}: ResumeCardViewerProps) {
  const ext = getExtension(item.name);
  const isImg = isImageExt(item.name);
  const isWord = ext === "docx" || ext === "doc";
  const isPdf = ext === "pdf";

  return (
    <>
      {/* 卡片顶栏：文件核心元信息 + 原版直开 + 提炼画像 + 默认与删除 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-stone-800/80 bg-stone-900/60 shrink-0 cursor-default"
        onClick={() => {
          if (isReadingMode) onSetReadingMode(false);
        }}
      >
        {/* 文件名与格式徽章 */}
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            {isImg ? (
              <ImageIcon className="size-4 text-purple-400" />
            ) : isPdf ? (
              <FileText className="size-4 text-red-400" />
            ) : (
              <FileText className="size-4 text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-100 truncate max-w-[240px] sm:max-w-[360px]">
                {item.name}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase bg-stone-800 text-stone-300 border border-stone-700">
                {ext}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {item.mtime} · {formatSize(item.size)}
            </p>
          </div>
        </div>

        {/* 快捷操作动作组 */}
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. 一键系统原版直开（直接调起 Windows 关联的本地 WPS / Word / 照片） */}
          <button
            type="button"
            onClick={() => onOpenNative(item.name)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800/90 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-semibold shadow-sm cursor-pointer active:scale-95 transition-all"
            title="使用 Windows 默认关联软件（如 WPS / Office / 系统照片）直接打开原版文件"
          >
            <ExternalLink className="size-3.5 text-amber-400" />
            <span>原版直开</span>
          </button>

          {/* 2. 一键基于此资料提炼求职画像 */}
          <button
            type="button"
            onClick={() => {
              if (onExtractProfile) {
                onExtractProfile(item.name, content?.text);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/15 cursor-pointer active:scale-95 transition-all"
            title="呼唤 AI 顾问根据此资料提炼求职画像"
          >
            <Sparkles className="size-3.5" />
            <span>提炼画像</span>
          </button>

          {/* 3. 一键呼唤 Agent 2 简历精修与诊断 */}
          <button
            type="button"
            onClick={() => {
              if (onReviewResume) {
                onReviewResume(item.name, content?.text);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-purple-500/20 cursor-pointer active:scale-95 transition-all"
            title="呼唤简历精修 Agent：ATS 算法深度诊断 + STAR / XYZ 改写"
          >
            <Sparkles className="size-3.5 text-amber-300" />
            <span>AI 深度精修</span>
          </button>

          {/* 3. 设为默认 / 当前默认 */}
          {!item.is_default ? (
            <button
              type="button"
              onClick={() => onSetDefault(item.name)}
              disabled={busy}
              className="flex items-center gap-1 text-xs py-1.5 px-2.5 rounded-xl border border-stone-800 hover:border-amber-500/40 text-stone-400 hover:text-stone-200 cursor-pointer transition-all"
              title="设为投递时优先使用的默认文件"
            >
              <Star className="size-3.5 text-stone-400" />
              <span>设默认</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              <span>默认</span>
            </span>
          )}

          {/* 4. 按住删除按钮 (React Bits 液态波纹进度长按确认，防误触物理安全销毁) */}
          <HoldButton
            icon={<Trash2 className="size-3.5" />}
            doneIcon={<Trash2 className="size-3.5 text-white" />}
            children="按住删除"
            doneLabel="已安全删除"
            backgroundColor="rgba(28, 25, 23, 0.9)"
            fillColor="#ef4444"
            textColor="#78716c"
            fillTextColor="#ffffff"
            size="sm"
            radius={12}
            holdTime={1400}
            releaseTime={200}
            wave={true}
            waveAmplitude={6}
            glow={true}
            disabled={busy}
            onHold={() => onDeleteConfirmed(item.name)}
            className="border border-stone-800 hover:border-red-500/40 hover:text-red-400 !h-8 !px-2.5 !text-xs !font-medium"
          />
        </div>
      </div>

      {/* 卡片主体：真实高清内容视窗 (100% 留给文件本身，支持内层独立平滑滚动) */}
      <div className="flex-1 min-h-0 w-full p-4 overflow-hidden flex flex-col items-stretch justify-start bg-[#110f0e] relative">
        {/* 1. 图片格式 (简历原图、学信网报告、技能证书) */}
        {isImg && (
          <div
            className="w-full h-full flex flex-col items-center justify-center relative group"
            onClick={(e) => {
              e.stopPropagation();
              if (!isReadingMode) onSetReadingMode(true);
            }}
          >
            {/* 悬浮缩放控制栏 */}
            <div
              className="absolute top-2 right-2 flex items-center gap-1 bg-stone-900/90 backdrop-blur border border-stone-700/60 rounded-xl p-1 z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setImgZoom((z) => Math.max(0.5, z - 0.2))}
                className="p-1 hover:text-amber-400 text-stone-400 cursor-pointer"
                title="缩小"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <span className="text-[10px] text-stone-400 font-mono px-1">
                {Math.round(imgZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImgZoom((z) => Math.min(2.5, z + 0.2))}
                className="p-1 hover:text-amber-400 text-stone-400 cursor-pointer"
                title="放大"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setImgZoom(1)}
                className="p-1 hover:text-amber-400 text-stone-400 cursor-pointer"
                title="适应窗口"
              >
                <Maximize className="size-3.5" />
              </button>
            </div>

            <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
              <img
                src={blobUrl || content?.data_url}
                alt={item.name}
                style={{ transform: `scale(${imgZoom})`, transformOrigin: "center center" }}
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-stone-800/80 transition-transform duration-150 select-none pointer-events-auto"
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1.5 shrink-0">
              <ImageIcon className="size-3 text-purple-400" />
              <span>原图高清预览 · 可点击右上角「原版直开」在系统照片查看器全屏核对</span>
            </p>
          </div>
        )}

        {/* 2. Word 文档提取预览 (.docx / .doc) */}
        {isWord && (
          <div className="w-full h-full min-h-0 flex flex-col text-left">
            {/* Word 排版温馨引导横条 */}
            <div
              className="flex items-center justify-between px-3.5 py-2 mb-2.5 rounded-xl border border-blue-500/20 bg-blue-950/20 text-xs text-blue-300 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-blue-400" />
                <span>纯文本提取视图（如需查看 100% 原始矢量双栏排版与表格，请点击右侧）</span>
              </span>
              <button
                type="button"
                onClick={() => onOpenNative(item.name)}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-[11px] font-semibold border border-blue-500/30 cursor-pointer"
              >
                在 WPS/Word 打开原版 ↗
              </button>
            </div>

            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isReadingMode) onSetReadingMode(true);
              }}
              onWheel={(e) => {
                e.stopPropagation();
                if (!isReadingMode) onSetReadingMode(true);
              }}
              className={`flex-1 min-h-0 overflow-y-auto rounded-xl border p-5 leading-relaxed text-stone-200 select-text allow-inner-scroll reading-content-zone transition-all ${
                isReadingMode
                  ? isMonochrome
                    ? "border-white/60 ring-2 ring-white/15 bg-[#09090b] shadow-inner"
                    : "border-amber-500/70 ring-2 ring-amber-500/20 bg-[#161412] shadow-inner"
                  : "border-stone-800 bg-[#161412]/80 hover:border-stone-700 cursor-pointer"
              }`}
              title={
                isReadingMode
                  ? "正在专注阅读中：滚轮或触控板双指上下浏览正文（点击卡片外部恢复）"
                  : "点击正文区域进入专注阅读模式（滚轮浏览文档内容）"
              }
            >
              {content?.text ? (
                <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-stone-300">
                  {content.text}
                </pre>
              ) : (
                <div className="py-20 text-center text-stone-500 text-xs space-y-2">
                  <RefreshCw className="mx-auto size-6 animate-spin text-amber-500/40" />
                  <p>正在读取并提取 Word 文档内容...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. PDF 预览 */}
        {isPdf && (
          <div
            className="w-full h-full flex flex-col"
            onClick={(e) => {
              e.stopPropagation();
              if (!isReadingMode) onSetReadingMode(true);
            }}
          >
            <iframe
              src={blobUrl || content?.data_url}
              className="w-full h-full min-h-[460px] rounded-xl border border-stone-800 bg-[#2b2b2b] shadow-inner"
              title={item.name}
            />
          </div>
        )}
      </div>

      {/* 卡片底栏交互提示 */}
      <div
        className="px-5 py-2.5 bg-stone-900/80 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between shrink-0 cursor-default"
        onClick={() => {
          if (isReadingMode) onSetReadingMode(false);
        }}
      >
        <span className="flex items-center gap-1.5">
          {isFlat ? (
            <LayoutGrid className="size-3 text-amber-400" />
          ) : (
            <Layers className="size-3 text-amber-400" />
          )}
          <span>
            {isFlat
              ? "2D 纯平模式 · 滚轮自由浏览全文 · 无 3D 景深与倾角"
              : isReadingMode
              ? "📜 正文阅读中 · 滚轮/双指平滑滚动 · 点击空白或右上角恢复抽屉轮换"
              : "3D 书架抽屉层叠 · 滚轮滚动、拖动或点击卡片均可抽拉切换 · 点击正文阅读"}
          </span>
        </span>
        <span className="text-stone-500 font-mono text-[10px]">
          {item.is_default ? "★ 默认投递简历" : "备用投递资料"}
        </span>
      </div>
    </>
  );
}
