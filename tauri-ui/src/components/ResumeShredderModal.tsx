import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  X,
  RotateCcw,
  Sparkles,
  Flame,
  FileText,
  AlertTriangle,
} from "lucide-react";
import PaperCrumple, { type PaperCrumpleHandle } from "./core/PaperCrumple";
import type { ResumeItem, ResumeContentResult } from "../lib/ipc";
import { createDocumentTexture } from "../lib/documentTexture";
import { getExtension } from "../lib/resumeUtils";

interface ResumeShredderModalProps {
  item: ResumeItem;
  content?: ResumeContentResult;
  blobUrl?: string;
  onClose: () => void;
  onDeleted: (name: string) => Promise<void> | void;
}

export default function ResumeShredderModal({
  item,
  content,
  blobUrl,
  onClose,
  onDeleted,
}: ResumeShredderModalProps) {
  const [paperTextureUrl, setPaperTextureUrl] = useState<string>("");
  const [paperError, setPaperError] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [isCrumpled, setIsCrumpled] = useState(false);
  const [isShredding, setIsShredding] = useState(false);
  const [shredProgress, setShredProgress] = useState(0);

  const paperRef = useRef<PaperCrumpleHandle>(null);
  const trashZoneRef = useRef<HTMLDivElement>(null);

  // 1. 生成高分辨率纸张贴图
  useEffect(() => {
    let active = true;
    createDocumentTexture(item, content, blobUrl)
      .then((url) => {
        if (active) {
          setPaperTextureUrl(url);
        }
      })
      .catch((err) => {
        console.warn("createDocumentTexture error:", err);
        if (active) setPaperError(true);
      });
    return () => {
      active = false;
    };
  }, [item, content, blobUrl]);

  // 2. 检测拖拽位置是否进入下方碎纸机区域
  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!trashZoneRef.current) return;
    const rect = trashZoneRef.current.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left - 60 &&
      e.clientX <= rect.right + 60 &&
      e.clientY >= rect.top - 70 &&
      e.clientY <= rect.bottom + 90;
    setIsOverTrash(inside);
  }, []);

  // 3. 执行物理粉碎流程
  const executeShred = useCallback(async () => {
    if (isShredding) return;
    setIsShredding(true);

    for (let p = 0; p <= 100; p += 20) {
      setShredProgress(p);
      await new Promise((r) => setTimeout(r, 60));
    }

    try {
      await onDeleted(item.name);
      onClose();
    } catch (err) {
      console.error("删除失败:", err);
      setIsShredding(false);
    }
  }, [isShredding, onDeleted, item.name, onClose]);

  // 4. 释放鼠标：若悬停在碎纸机上则触发粉碎
  const handleDragEnd = useCallback(() => {
    if (isOverTrash) {
      executeShred();
    }
  }, [isOverTrash, executeShred]);

  // 5. 团成纸球辅助按钮
  const handleForceCrumple = () => {
    setIsCrumpled(true);
    paperRef.current?.crumple();
  };

  // 使用 React Portal 保证模态舱脱离任何内部 3D transform 容器，直接覆盖在视窗最顶层
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-stone-950/92 backdrop-blur-md select-none animate-in fade-in duration-200"
      style={{ isolation: "isolate" }}
      onPointerMove={(e) => {
        if (isCrumpled) {
          handleDragMove(e.nativeEvent);
        }
      }}
      onPointerUp={() => {
        if (isOverTrash) {
          executeShred();
        }
      }}
    >
      {/* 顶部状态栏与关闭控制 */}
      <div className="w-full max-w-5xl px-6 pt-5 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-mono tracking-wider shadow-lg shadow-red-950/60">
            <Flame className="size-3.5 text-red-400 animate-pulse" />
            <span>物理碎纸销毁舱 · PERMANENT REMOVAL</span>
          </div>
          <span className="text-stone-400 text-xs">
            当前选中：<strong className="text-stone-200 font-medium">{item.name}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isShredding}
          className="flex items-center gap-1.5 text-xs text-stone-300 hover:text-stone-100 bg-stone-900/90 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all shadow-md active:scale-95"
        >
          <X className="size-4" />
          <span>取消 (保留档案)</span>
        </button>
      </div>

      {/* 中间核心 3D 纸张舞台 */}
      <div className="relative flex-1 w-full flex flex-col items-center justify-center overflow-hidden py-4">
        {/* 操作提示气泡 */}
        <div className="absolute top-2 text-center z-20 pointer-events-none">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-stone-900/90 border border-stone-800 text-stone-300 text-xs shadow-xl backdrop-blur">
            <Sparkles className="size-3.5 text-amber-400 animate-spin" />
            <span>
              {isCrumpled
                ? "纸张已团成球，按住拖拽投入下方碎纸回收桶"
                : "点击并按住纸张团成纸球，拖拽投入碎纸桶即可销毁"}
            </span>
          </div>
        </div>

        {/* 3D WebGL 纸张渲染 或 优雅 2D/3D 卡片兜底 */}
        {paperTextureUrl && !paperError ? (
          <div
            className={`w-[360px] h-[520px] flex items-center justify-center relative transition-all duration-500 ${
              isShredding
                ? "scale-0 rotate-[180deg] opacity-0 translate-y-64 pointer-events-none"
                : "scale-100 opacity-100"
            }`}
          >
            <PaperCrumple
              ref={paperRef}
              src={paperTextureUrl}
              alt={item.name}
              width={340}
              height={450}
              sceneHeight={520}
              imageFit="cover"
              releaseBehavior="stay"
              crumpleAmount={0.88}
              crumpleDuration={0.45}
              releaseDuration={0.35}
              foldCount={7}
              foldSharpness={0.65}
              wrinkleDepth={0.7}
              paperColor="#f6f2ea"
              paperTexture={0.1}
              lightIntensity={2.1}
              draggable={true}
              dragRotation={12}
              dragRadius={320}
              returnToOrigin={false}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onError={() => setPaperError(true)}
              onStateChange={(state: string) => {
                if (state === "crumpling" || state === "holding" || state === "crumpled") {
                  setIsCrumpled(true);
                }
              }}
            />
          </div>
        ) : (
          /* 当 3D 纹理初始化中或硬件不支持 WebGL 时的高保真实体卡片兜底 */
          <div
            className={`w-[320px] h-[430px] rounded-2xl bg-[#faf7f2] border-2 border-[#e3dacd] shadow-2xl p-5 flex flex-col justify-between text-stone-900 cursor-grab active:cursor-grabbing transition-all duration-500 ${
              isCrumpled ? "scale-75 rotate-6 rounded-3xl ring-4 ring-amber-500/40" : ""
            } ${
              isShredding
                ? "scale-0 rotate-[180deg] opacity-0 translate-y-64 pointer-events-none"
                : ""
            }`}
            onClick={handleForceCrumple}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-2">
                <span className="font-bold text-xs text-amber-700 tracking-wider">
                  RESUME ARCHIVE // 档案资料
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  {getExtension(item.name).toUpperCase() || "DOC"}
                </span>
              </div>
              <h3 className="font-bold text-base text-stone-900 truncate">
                {item.name}
              </h3>
              <p className="text-xs text-stone-500">
                规格: {(item.size / 1024).toFixed(1)} KB | 状态: 待粉碎
              </p>
              <div className="h-44 bg-stone-100 rounded-xl p-3 text-[11px] text-stone-600 space-y-1.5 overflow-hidden border border-stone-200/80">
                <p className="font-semibold text-teal-800">【档案摘要内容】</p>
                <p className="line-clamp-5 leading-relaxed">
                  {content?.text || "本地求职资料资产，已建立本地索引。包含简历结构化信息。"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-stone-300 pt-2 text-[10px] text-stone-400">
              <span>★ 官方归档印章 ★</span>
              <span className="text-amber-800 font-medium">点击可预捏成团</span>
            </div>
          </div>
        )}
      </div>

      {/* 底部：高能碎纸回收桶与引力吸附区 */}
      <div className="w-full max-w-2xl pb-8 px-6 flex flex-col items-center z-30">
        <div
          ref={trashZoneRef}
          className={`relative w-full max-w-md p-5 rounded-3xl border transition-all duration-300 flex flex-col items-center justify-center cursor-pointer shadow-2xl ${
            isOverTrash
              ? "bg-red-950/90 border-red-500 scale-105 shadow-red-500/40 ring-4 ring-red-500/30"
              : isShredding
              ? "bg-stone-900/90 border-amber-500 shadow-amber-500/20"
              : "bg-stone-900/80 border-stone-800 hover:border-red-900/80 shadow-black/60"
          }`}
          onClick={executeShred}
        >
          {/* 碎纸机入纸口仿真槽 */}
          <div className="w-52 h-3.5 rounded-full bg-black/90 border border-stone-800 mb-3 overflow-hidden relative shadow-inner">
            <div
              className={`absolute inset-0 bg-gradient-to-r transition-all duration-300 ${
                isOverTrash
                  ? "from-red-600 via-amber-500 to-red-600 animate-pulse"
                  : isShredding
                  ? "from-amber-400 to-red-500 w-full"
                  : "from-stone-700 to-stone-900"
              }`}
            />
          </div>

          {/* 垃圾桶 / 碎纸机图标与文字 */}
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl transition-all duration-300 ${
                isOverTrash
                  ? "bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50 animate-bounce"
                  : isShredding
                  ? "bg-amber-500 text-black scale-105 animate-pulse"
                  : "bg-stone-800 text-stone-400"
              }`}
            >
              <Trash2 className="size-6" />
            </div>

            <div className="flex flex-col">
              <span
                className={`text-sm font-semibold transition-colors ${
                  isOverTrash
                    ? "text-red-400"
                    : isShredding
                    ? "text-amber-400"
                    : "text-stone-300"
                }`}
              >
                {isOverTrash
                  ? "🔥 松开鼠标，立即彻底粉碎！"
                  : isShredding
                  ? `⚡ 正在物理撕碎并擦除档案 (${shredProgress}%)...`
                  : "碎纸机回收桶 (拖入纸团或点击此处)"}
              </span>
              <span className="text-[11px] text-stone-500">
                {isOverTrash
                  ? "已捕捉到纸团投递引力，准备执行物理抹除"
                  : "按住纸张团成纸球，拉至此处松手即可彻底销毁"}
              </span>
            </div>
          </div>

          {/* 碎纸进度条 */}
          {isShredding && (
            <div className="w-full mt-4 h-1.5 rounded-full bg-stone-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-100 ease-out"
                style={{ width: `${shredProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* 辅助快捷按钮栏 */}
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={handleForceCrumple}
            disabled={isShredding || isCrumpled}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-900/70 hover:bg-stone-800 border border-stone-800/80 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            <RotateCcw className="size-3.5" />
            <span>一键团成纸球</span>
          </button>

          <button
            type="button"
            onClick={executeShred}
            disabled={isShredding}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-950/90 border border-red-900/60 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-40 active:scale-95 shadow-sm"
          >
            <Trash2 className="size-3.5" />
            <span>直接粉碎入库文档</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
