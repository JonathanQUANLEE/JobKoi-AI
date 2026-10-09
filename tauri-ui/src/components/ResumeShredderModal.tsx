import { useState, useRef, useEffect, useCallback } from "react";
import {
  Trash2,
  X,
  RotateCcw,
  Sparkles,
  Flame,
} from "lucide-react";
import PaperCrumple, { type PaperCrumpleHandle } from "./core/PaperCrumple";
import type { ResumeItem, ResumeContentResult } from "../lib/ipc";

interface ResumeShredderModalProps {
  item: ResumeItem;
  content?: ResumeContentResult;
  blobUrl?: string;
  onClose: () => void;
  onDeleted: (name: string) => Promise<void> | void;
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

function isImageFile(name: string): boolean {
  const ext = getFileExtension(name);
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}

/**
 * 绘制高保真 A4 拟真公文纸张质感画布
 * 使任何 Word / PDF / TXT / 图片都能化身为可 3D 揉皱团碎的逼真实体纸张
 */
function createDocumentTexture(
  item: ResumeItem,
  content?: ResumeContentResult,
  imageSrc?: string
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve("");
      return;
    }

    const ext = getFileExtension(item.name);
    const isImg = isImageFile(item.name);

    // 1. 底层米黄色道林纸质感底色
    ctx.fillStyle = "#faf7f2";
    ctx.fillRect(0, 0, 720, 960);

    // 纸张微细浅格纹
    ctx.strokeStyle = "rgba(0, 0, 0, 0.025)";
    ctx.lineWidth = 1;
    for (let y = 48; y < 960; y += 36) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(672, y);
      ctx.stroke();
    }

    // 纸张边缘装订线与安全框
    ctx.strokeStyle = "#e3dacd";
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, 648, 888);

    // 顶部安全公文条
    ctx.fillStyle = "#1e1b18";
    ctx.fillRect(52, 52, 616, 52);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("RESUME ARCHIVE // 简历与能力资料库", 72, 84);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 13px monospace";
    ctx.fillText(ext ? ext.toUpperCase() : "DOC", 610, 84);

    // 文档大标题
    ctx.fillStyle = "#1c1917";
    ctx.font = "bold 24px sans-serif";
    const displayName =
      item.name.length > 26 ? item.name.slice(0, 24) + "..." : item.name;
    ctx.fillText(displayName, 64, 146);

    // 文档元信息
    ctx.fillStyle = "#78716c";
    ctx.font = "14px sans-serif";
    const sizeKb = (item.size / 1024).toFixed(1);
    ctx.fillText(
      `规格: ${sizeKb} KB   |   入库记录: ${item.mtime || "2026-10"}   |   密级: 核心资产`,
      64,
      176
    );

    // 装饰分隔红线
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 192);
    ctx.lineTo(656, 192);
    ctx.stroke();

    // 如果是纯图片且有原图
    if (isImg && imageSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          // 在公文中心优雅居中贴图
          const drawW = 592;
          const drawH = 560;
          const imgAspect = img.width / img.height;
          let w = drawW;
          let h = drawW / imgAspect;
          if (h > drawH) {
            h = drawH;
            w = drawH * imgAspect;
          }
          const x = 64 + (drawW - w) / 2;
          const y = 210 + (drawH - h) / 2;
          ctx.drawImage(img, x, y, w, h);
        } catch {
          // ignore
        }
        drawStampAndWatermark(ctx);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        drawFallbackText(ctx, content, item);
        drawStampAndWatermark(ctx);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = imageSrc;
      return;
    }

    // 非图片（PDF、DOCX、TXT），提取真实文字渲染版面
    drawFallbackText(ctx, content, item);
    drawStampAndWatermark(ctx);
    resolve(canvas.toDataURL("image/png"));
  });
}

function drawFallbackText(
  ctx: CanvasRenderingContext2D,
  content: ResumeContentResult | undefined,
  item: ResumeItem
) {
  ctx.fillStyle = "#292524";
  ctx.font = "15px sans-serif";

  const ext = getFileExtension(item.name);

  let lines: string[] = [];
  if (content?.text && content.text.trim().length > 0) {
    lines = content.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 18);
  }

  if (lines.length === 0) {
    lines = [
      "【档案性质】 本地智能求职资料入库归档",
      "【安全说明】 包含用户个人简历、技能评定及求职偏好",
      "【入库状态】 数字指纹已绑定，可执行物理碎纸机擦除",
      "--------------------------------------------------",
      "该文档在系统运行中可作为投递与智能匹配的依据凭证。",
      "执行销毁后，所有本地文件映射及解析缓存将被永久抹除。",
      "--------------------------------------------------",
      "• 档案名称: " + item.name,
      "• 文件类型: " + (ext ? ext.toUpperCase() : "DOC"),
      "• 默认优先: " + (item.is_default ? "是 (默认投递件)" : "否"),
      "• 擦除模式: 3D 物理撕裂与纸球碎纸机回收",
    ];
  }

  let currY = 230;
  for (const line of lines) {
    if (currY > 780) break;
    if (line.startsWith("【") || line.startsWith("#")) {
      ctx.fillStyle = "#0f766e";
      ctx.font = "bold 15px sans-serif";
    } else {
      ctx.fillStyle = "#44403c";
      ctx.font = "14px sans-serif";
    }
    const truncated = line.length > 40 ? line.slice(0, 38) + "..." : line;
    ctx.fillText(truncated, 64, currY);
    currY += 28;
  }
}

function drawStampAndWatermark(ctx: CanvasRenderingContext2D) {
  // 红色官方公章印鉴
  ctx.save();
  ctx.translate(550, 780);
  ctx.rotate(-0.08);
  ctx.strokeStyle = "rgba(220, 38, 38, 0.78)";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220, 38, 38, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("求职资产库", 0, -10);
  ctx.fillText("★ 档案归档章 ★", 0, 10);
  ctx.font = "10px sans-serif";
  ctx.fillText("VERIFIED ARCHIVE", 0, 26);
  ctx.restore();

  // 底部防伪编码水印
  ctx.fillStyle = "#a8a29e";
  ctx.font = "12px monospace";
  ctx.fillText("CONFIDENTIAL ASSET // CRUMPLE TO DESTROY // SYSTEM BOT", 64, 896);
}

export default function ResumeShredderModal({
  item,
  content,
  blobUrl,
  onClose,
  onDeleted,
}: ResumeShredderModalProps) {
  const [paperTextureUrl, setPaperTextureUrl] = useState<string>("");
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [isCrumpled, setIsCrumpled] = useState(false);
  const [isShredding, setIsShredding] = useState(false);
  const [shredProgress, setShredProgress] = useState(0);

  const paperRef = useRef<PaperCrumpleHandle>(null);
  const trashZoneRef = useRef<HTMLDivElement>(null);

  // 1. 生成高分辨率纸张贴图
  useEffect(() => {
    let active = true;
    createDocumentTexture(item, content, blobUrl).then((url) => {
      if (active) setPaperTextureUrl(url);
    });
    return () => {
      active = false;
    };
  }, [item, content, blobUrl]);

  // 2. 检测拖拽位置是否进入下方碎纸机区域
  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!trashZoneRef.current) return;
    const rect = trashZoneRef.current.getBoundingClientRect();
    // 增加一定的磁吸感应边界
    const inside =
      e.clientX >= rect.left - 50 &&
      e.clientX <= rect.right + 50 &&
      e.clientY >= rect.top - 60 &&
      e.clientY <= rect.bottom + 80;
    setIsOverTrash(inside);
  }, []);

  // 3. 执行物理粉碎流程
  const executeShred = useCallback(async () => {
    if (isShredding) return;
    setIsShredding(true);

    // 碎纸进度条动效
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/85 backdrop-blur-xl select-none animate-in fade-in duration-200">
      {/* 顶部状态栏与关闭控制 */}
      <div className="w-full max-w-5xl px-6 pt-5 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950/70 border border-red-500/40 text-red-300 text-xs font-mono tracking-wider shadow-lg shadow-red-950/50">
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
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-100 bg-stone-900/80 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 px-3 py-1.5 rounded-xl cursor-pointer transition-all"
        >
          <X className="size-4" />
          <span>取消 (保留档案)</span>
        </button>
      </div>

      {/* 中间核心 3D 纸张舞台 */}
      <div className="relative flex-1 w-full flex flex-col items-center justify-center overflow-hidden">
        {/* 操作提示气泡 */}
        <div className="absolute top-4 text-center z-20 pointer-events-none">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-stone-900/80 border border-stone-800 text-stone-300 text-xs shadow-xl backdrop-blur">
            <Sparkles className="size-3.5 text-amber-400 animate-spin" />
            <span>
              {isCrumpled
                ? "纸张已团成球，按住拖拽投入下方碎纸回收桶"
                : "点击并按住纸张团成纸球，拖拽投入碎纸桶即可销毁"}
            </span>
          </div>
        </div>

        {/* PaperCrumple 3D 物理画布 */}
        {paperTextureUrl ? (
          <div
            className={`transition-all duration-500 ${
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
              onStateChange={(state: string) => {
                if (state === "crumpling" || state === "holding" || state === "crumpled") {
                  setIsCrumpled(true);
                }
              }}
            />
          </div>
        ) : (
          <div className="w-80 h-96 flex flex-col items-center justify-center border border-dashed border-stone-800 rounded-2xl bg-stone-900/30 text-stone-500 gap-3">
            <div className="size-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-xs">正在渲染拟真纸张材质...</span>
          </div>
        )}
      </div>

      {/* 底部：高能碎纸回收桶与引力吸附区 */}
      <div className="w-full max-w-2xl pb-8 px-6 flex flex-col items-center z-30">
        <div
          ref={trashZoneRef}
          className={`relative w-full max-w-md p-5 rounded-3xl border transition-all duration-300 flex flex-col items-center justify-center cursor-pointer shadow-2xl ${
            isOverTrash
              ? "bg-red-950/80 border-red-500 scale-105 shadow-red-500/30 ring-4 ring-red-500/20"
              : isShredding
              ? "bg-stone-900/90 border-amber-500 shadow-amber-500/20"
              : "bg-stone-900/60 border-stone-800 hover:border-red-900/60 shadow-black/60"
          }`}
          onClick={executeShred}
        >
          {/* 碎纸机入纸口仿真槽 */}
          <div className="w-48 h-3 rounded-full bg-black/80 border border-stone-800 mb-3 overflow-hidden relative shadow-inner">
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
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 bg-stone-900/60 hover:bg-stone-800 border border-stone-800/80 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="size-3.5" />
            <span>一键团成纸球</span>
          </button>

          <button
            type="button"
            onClick={executeShred}
            disabled={isShredding}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/80 border border-red-900/50 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            <span>直接粉碎入库文档</span>
          </button>
        </div>
      </div>
    </div>
  );
}
