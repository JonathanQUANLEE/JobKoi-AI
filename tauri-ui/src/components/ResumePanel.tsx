import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  FileText,
  RefreshCw,
  UploadCloud,
  Star,
  Trash2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  Layers,
  LayoutGrid,
  FolderOpen,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  X,
  FileCheck,
} from "lucide-react";
import { ipc, type ResumeItem, type ResumeContentResult } from "../lib/ipc";
import { useT, useRunStore } from "../store";
import { MagicCard } from "./core/MagicBento";
import EnergyCapsule from "./core/EnergyCapsule";
import CardSwap, { Card, type CardSwapHandle } from "./core/CardSwap";
import HoldButton from "./core/HoldButton";
import ErrorBoundary from "./ErrorBoundary";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

export default function ResumePanel({
  onExtractProfile,
  onGoToProfile,
}: ResumePanelProps) {
  const t = useT();
  const notify = useRunStore((s) => s.notify);
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);

  // 选中的/处于最前方的文件名
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // 缓存所有文件的内容与 Blob URL，供 3D 书架抽屉堆叠卡片即时展示
  const [contentsCache, setContentsCache] = useState<Record<string, ResumeContentResult>>({});
  const [blobCache, setBlobCache] = useState<Record<string, string>>({});
  const [loadingCache, setLoadingCache] = useState<Record<string, boolean>>({});

  // 能量胶囊充盈进度条状态
  const [chargingProgress, setChargingProgress] = useState<number | null>(null);
  const [chargingStatus, setChargingStatus] = useState<string>("");

  // 图片缩放控制
  const [imgZoom, setImgZoom] = useState<number>(1);

  // 拖拽上传与文件选择
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 专注阅读模式状态（点击正文预览框时锁定，仅供滚轮浏览正文；点击外部恢复抽屉切卡）
  const [isReadingMode, setIsReadingMode] = useState(false);
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");

  // 视图呈现模式：系统打开默认 3D 书架抽屉模式 ("3d")
  const [viewMode, setViewMode] = useState<"3d" | "flat">("3d");

  // 平铺模式下：单份沉浸标签直读 (false) vs 多份全部网格展开 (true)
  const [flatSpreadAll, setFlatSpreadAll] = useState(false);

  const handleViewModeChange = (mode: "3d" | "flat") => {
    setViewMode(mode);
    setIsReadingMode(false);
  };

  const DEFAULT_CARD_HEIGHT = 640;
  const MIN_CARD_HEIGHT = 480;

  // 用户自定义视窗垂直拉伸高度（仅支持向下/向上垂直拖拽，不影响横向宽度与全局布局）
  const [cardHeight, setCardHeight] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem("boss_resumes_card_height") || "", 10);
      return saved >= MIN_CARD_HEIGHT ? saved : DEFAULT_CARD_HEIGHT;
    } catch {
      return DEFAULT_CARD_HEIGHT;
    }
  });

  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [isExceedingMax, setIsExceedingMax] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const warnedRef = useRef(false);

  // 底部手柄向下/向上拖拽调整高度（受应用软件界面最大底边边界约束，超出时告警并在松手后贴底）
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = cardHeight;
    setIsResizingHeight(true);
    setIsExceedingMax(false);
    warnedRef.current = false;

    // 计算当前视口可用最大高度边界
    const rect = stageRef.current?.getBoundingClientRect();
    const stageTop = rect ? rect.top : 140;
    // 留出 40px 底部安全间隙，不能超出整个软件主视窗
    const maxAllowed = Math.max(MIN_CARD_HEIGHT + 100, window.innerHeight - stageTop - 40);

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = moveEvent.clientY - startY;
      const rawHeight = startHeight + deltaY;

      if (rawHeight > maxAllowed) {
        setIsExceedingMax(true);
        if (!warnedRef.current) {
          warnedRef.current = true;
          notify({
            type: "warning",
            text: "已达应用软件界面最大拉伸边界，松手后将自动贴齐窗口底端",
            source: "视窗调整",
          });
        }
        // 允许拉伸过程中视觉稍微有一点阻尼超出提示，但不能无限拖大
        setCardHeight(Math.round(maxAllowed + Math.min(20, (rawHeight - maxAllowed) * 0.1)));
      } else {
        setIsExceedingMax(false);
        warnedRef.current = false;
        const clamped = Math.max(MIN_CARD_HEIGHT, Math.min(maxAllowed, rawHeight));
        setCardHeight(Math.round(clamped));
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizingHeight(false);

      setCardHeight((current) => {
        let finalHeight = current;
        if (current > maxAllowed) {
          finalHeight = Math.round(maxAllowed);
        } else if (current < MIN_CARD_HEIGHT) {
          finalHeight = MIN_CARD_HEIGHT;
        }
        try {
          localStorage.setItem("boss_resumes_card_height", finalHeight.toString());
        } catch {}
        return finalHeight;
      });
      setIsExceedingMax(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 按下 Esc 键随时退出正文阅读锁定
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isReadingMode) {
        setIsReadingMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReadingMode]);

  // CardSwap 引用，支持联动控制
  const cardSwapRef = useRef<CardSwapHandle>(null);

  // 加载简历列表
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await ipc.listResumes();
      setResumes(result.resumes);

      // 默认选中默认简历，或第一份简历
      setSelectedName((prev) => {
        if (prev && result.resumes.some((r) => r.name === prev)) {
          return prev;
        }
        const defaultItem = result.resumes.find((r) => r.is_default);
        return defaultItem ? defaultItem.name : result.resumes[0]?.name || null;
      });
    } catch (err) {
      notify({ type: "error", text: t("resume.loadFailed", { error: String(err) }), source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }, [t, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 预加载所有未缓存的文件内容与 Blob 流
  useEffect(() => {
    if (resumes.length === 0) return;

    resumes.forEach((item) => {
      if (contentsCache[item.name] || loadingCache[item.name]) return;

      setLoadingCache((prev) => ({ ...prev, [item.name]: true }));
      ipc
        .getResumeContent(item.name)
        .then((data) => {
          setContentsCache((prev) => ({ ...prev, [item.name]: data }));
          if (data.data_url) {
            const blobUrl = createBlobUrl(data.data_url, data.mime);
            setBlobCache((prev) => ({ ...prev, [item.name]: blobUrl }));
          }
        })
        .catch((err) => {
          console.warn(`加载资料内容 [${item.name}] 失败:`, err);
        })
        .finally(() => {
          setLoadingCache((prev) => ({ ...prev, [item.name]: false }));
        });
    });
  }, [resumes, contentsCache, loadingCache]);

  // 组件卸载时释放所有已生成的 Blob URL
  useEffect(() => {
    return () => {
      Object.values(blobCache).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, [blobCache]);

  // 设为默认简历
  async function handleSetDefault(name: string) {
    setBusy(true);
    try {
      await ipc.setDefaultResume(name);
      await refresh();
      notify({ type: "success", text: t("resume.defaultSet", { name }), source: "资料档案" });
    } catch (err) {
      notify({ type: "error", text: t("resume.setFailed", { error: String(err) }), source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }

  // 一键系统原生软件直开（调起本地 WPS / Word / 系统照片查看器等）
  async function handleOpenNative(name: string) {
    try {
      await ipc.openResumeNative(name);
      notify({ type: "info", text: `已调起系统原生软件打开「${name}」`, source: "资料档案" });
    } catch (err) {
      notify({ type: "error", text: `无法调起原版程序: ${String(err)}`, source: "资料档案" });
    }
  }

  // 物理销毁入库文件
  async function handleDeleteConfirmed(name: string) {
    setBusy(true);
    try {
      await ipc.deleteResumeFile(name);
      notify({ type: "success", text: `已安全销毁并移出资料库: 「${name}」`, source: "资料档案" });
      setContentsCache((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      if (blobCache[name]) {
        URL.revokeObjectURL(blobCache[name]);
        setBlobCache((prev) => {
          const copy = { ...prev };
          delete copy[name];
          return copy;
        });
      }
      await refresh();
    } catch (err) {
      notify({ type: "error", text: `删除失败: ${String(err)}`, source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }

  // 触发能量胶囊充盈入库特效动画
  const triggerEnergyCharge = async (task: () => Promise<void>) => {
    setChargingProgress(15);
    setChargingStatus("正在准备能量流，读取本地文件字节...");

    const t1 = setTimeout(() => {
      setChargingProgress(48);
      setChargingStatus("荧光能量汇聚中 · 正在解析文件多模态结构...");
    }, 200);

    const t2 = setTimeout(() => {
      setChargingProgress(88);
      setChargingStatus("能量充盈接近拉满 · 正在构建本地资产索引...");
    }, 450);

    try {
      await task();
      clearTimeout(t1);
      clearTimeout(t2);
      setChargingProgress(100);
      setChargingStatus("✨ 能量拉满 100% · 资料已成功入库并就绪！");

      setTimeout(() => {
        setChargingProgress(null);
        setChargingStatus("");
      }, 1400);
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setChargingProgress(null);
      throw err;
    }
  };

  // 处理多文件上传
  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);

    try {
      await triggerEnergyCharge(async () => {
        let lastUploadedName = "";
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const base64Data = await readFileAsBase64(file);
          await ipc.saveResumeFile(file.name, base64Data);
          lastUploadedName = file.name;
        }
        await refresh();
        if (lastUploadedName) {
          setSelectedName(lastUploadedName);
        }
      });
      notify({
        type: "success",
        text: `成功将 ${files.length} 份资料入库至本地资料库`,
        source: "资料档案",
      });
    } catch (err) {
      console.error("上传文件入库失败:", err);
      notify({
        type: "error",
        text: `上传入库失败: ${String(err)}`,
        source: "资料档案",
      });
    } finally {
      setBusy(false);
    }
  }

  // 拖拽事件处理
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  }

  // 点击左侧紧凑列表项切换文件时，联动切换文件，3D 模式抽到最前，并重置阅读状态
  const handleItemSelect = (name: string, index: number) => {
    setIsReadingMode(false);
    setSelectedName(name);
    if (viewMode === "3d") {
      cardSwapRef.current?.bringToFront(index);
    }
  };

  // 渲染单份简历卡片内部主体（3D 卡片与 2D 平铺卡片共用）
  const renderCardInner = (item: ResumeItem, isFlat: boolean = false) => {
    const content = contentsCache[item.name];
    const blobUrl = blobCache[item.name];
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
            if (isReadingMode) setIsReadingMode(false);
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
              onClick={() => handleOpenNative(item.name)}
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

            {/* 3. 设为默认 / 当前默认 */}
            {!item.is_default ? (
              <button
                type="button"
                onClick={() => handleSetDefault(item.name)}
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
              onHold={() => handleDeleteConfirmed(item.name)}
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
                if (!isReadingMode) setIsReadingMode(true);
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
                  onClick={() => handleOpenNative(item.name)}
                  className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-[11px] font-semibold border border-blue-500/30 cursor-pointer"
                >
                  在 WPS/Word 打开原版 ↗
                </button>
              </div>

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isReadingMode) setIsReadingMode(true);
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
                if (!isReadingMode) setIsReadingMode(true);
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
            if (isReadingMode) setIsReadingMode(false);
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
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`space-y-4 animate-in fade-in duration-200 relative min-h-[calc(100vh-6rem)] pb-8 ${
        isDragging ? "ring-2 ring-amber-400/80 bg-amber-500/5 rounded-3xl" : ""
      }`}
    >
      {/* 全局拖拽悬浮提示 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 rounded-3xl bg-amber-950/40 backdrop-blur-sm border-2 border-dashed border-amber-400 flex flex-col items-center justify-center pointer-events-none animate-in zoom-in-95">
          <UploadCloud className="size-16 text-amber-400 animate-bounce mb-3" />
          <p className="text-base font-bold text-amber-200">松开鼠标即可入库至本地资料库</p>
          <p className="text-xs text-amber-300/80 mt-1">支持 PDF、Word (.docx/.doc)、图片证明材料</p>
        </div>
      )}



      {/* 当正在入库或上传时：展示荧光绿能量胶囊拉满特效！ */}
      {chargingProgress !== null && (
        <div className="p-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 backdrop-blur-md shadow-lg shadow-emerald-500/10 animate-in fade-in zoom-in-95 duration-200">
          <EnergyCapsule
            progress={chargingProgress}
            statusText={chargingStatus}
            isCharging={true}
          />
        </div>
      )}

      {/* 隐藏的批量文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleUploadFiles(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        className="hidden"
      />

      {/* ================= 左右经典主从分栏 (Left Slim Panel + Right 3D Stage) ================= */}
      {/* 彻底解决顶部重叠问题，充分利用宽屏两边的空白区域 */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* ================= 左侧：紧凑型资料资产档案面板 (宽约 280px) ================= */}
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
                  onClick={refresh}
                  disabled={busy}
                  title="刷新文件列表"
                >
                  <RefreshCw className={`size-3 ${busy ? "animate-spin text-amber-400" : ""}`} />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] py-1 px-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold hover:from-amber-400 hover:to-amber-500 shadow-sm cursor-pointer active:scale-95 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  <UploadCloud className="size-3" />
                  <span>上传 +</span>
                </button>
              </div>
            </div>

            {/* 紧凑拖拽入库框 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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
                      onClick={() => handleItemSelect(item.name, idx)}
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
                            handleDeleteConfirmed(item.name);
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

        {/* ================= 右侧：核心主体 3D 书架抽屉 CardSwap 大舞台 ================= */}
        {/* ================= 右侧：核心主体 3D 书架抽屉 CardSwap 大舞台 ================= */}
        {/* 顶部完全无遮挡，充足净空高度，支持滚轮滚动连续切卡 */}
        <div
          ref={stageRef}
          className="flex-1 min-w-0 w-full flex flex-col items-center justify-start relative overflow-visible"
          onClick={() => {
            if (isReadingMode) setIsReadingMode(false);
          }}
        >
          {/* 右侧舞台操作条 */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2.5 pb-3 px-1 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-200 flex items-center gap-1.5">
                {viewMode === "3d" ? (
                  <>
                    <Layers className="size-3.5 text-amber-400" />
                    <span>3D 书架抽屉层叠视图</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="size-3.5 text-amber-400" />
                    <span>经典纯净平铺模式</span>
                  </>
                )}
              </span>

              {isReadingMode ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold animate-in fade-in">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>📜 正在专注阅读中 · 滚轮/双指浏览文档 · 点击外部恢复</span>
                </span>
              ) : (
                <span className="text-[11px] text-stone-500 hidden sm:inline">
                  {viewMode === "3d"
                    ? "· 鼠标滚轮上下滚动或点击卡片即可轮换 · 点击正文进入阅读"
                    : "· 2D 纯平面直读 · 点击正文进入专注阅读 · 零倾角无景深"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* 核心功能：3D 抽屉 vs 平铺模式 视图切换胶囊 */}
              <div className="flex items-center p-0.5 rounded-xl bg-stone-900 border border-stone-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => handleViewModeChange("3d")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === "3d"
                      ? isMonochrome
                        ? "bg-white text-black shadow-md font-bold"
                        : "bg-amber-500 text-stone-950 shadow-md font-bold"
                      : "text-stone-400 hover:text-stone-200"
                  }`}
                  title="切换至 3D 书架抽屉层叠视图（立体景深，滚轮抽拉切换）"
                >
                  <Layers className="size-3.5" />
                  <span>3D 抽屉</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange("flat")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === "flat"
                      ? isMonochrome
                        ? "bg-white text-black shadow-md font-bold"
                        : "bg-amber-500 text-stone-950 shadow-md font-bold"
                      : "text-stone-400 hover:text-stone-200"
                  }`}
                  title="切换至纯净平铺模式（2D 平面无透视，适合沉浸直接阅读文档）"
                >
                  <LayoutGrid className="size-3.5" />
                  <span>平铺模式</span>
                </button>
              </div>

              {/* 阅读模式退出按钮（3D 与平铺模式通用） */}
              {isReadingMode && (
                <button
                  type="button"
                  onClick={() => setIsReadingMode(false)}
                  className="px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs transition-colors cursor-pointer"
                  title="退出正文阅读模式"
                >
                  退出阅读模式 (Esc)
                </button>
              )}

              {/* 3D 模式抽换按钮 */}
              {viewMode === "3d" && resumes.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReadingMode(false);
                    cardSwapRef.current?.swap();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
                  title="像拉抽屉一样切换下一张"
                >
                  <RotateCw className="size-3.5 text-amber-400" />
                  <span>抽换下一份 (Swap)</span>
                </button>
              )}

              {/* 平铺模式专属控制：单份直读 vs 全部展开 */}
              {viewMode === "flat" && resumes.length > 1 && (
                <div className="flex items-center p-0.5 rounded-xl bg-stone-900 border border-stone-800">
                  <button
                    type="button"
                    onClick={() => setFlatSpreadAll(false)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      !flatSpreadAll
                        ? "bg-stone-800 text-stone-200 border border-stone-700 shadow-sm"
                        : "text-stone-400 hover:text-stone-300"
                    }`}
                    title="单份大视窗直读"
                  >
                    单份直读
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlatSpreadAll(true)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      flatSpreadAll
                        ? "bg-stone-800 text-stone-200 border border-stone-700 shadow-sm"
                        : "text-stone-400 hover:text-stone-300"
                    }`}
                    title="全部并排网格平铺"
                  >
                    全部平铺
                  </button>
                </div>
              )}
            </div>
          </div>

          {resumes.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-[520px] rounded-3xl border-2 border-dashed border-stone-800 hover:border-amber-500/40 bg-[#161412]/50 flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all hover:bg-[#161412]"
            >
              <FolderOpen className="size-16 text-stone-600 mb-3" />
              <h3 className="text-base font-bold text-stone-200">资料库尚无文件</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                点击左侧「上传资料 +」或拖拽文件入库，即刻体验资料大视窗
              </p>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-start">
              {viewMode === "3d" ? (
                /* ================= 3D 书架抽屉层叠视图 ================= */
                <div
                  className="w-full flex justify-center items-center pt-8 pb-4 overflow-visible"
                  style={{ minHeight: `${cardHeight + 20}px` }}
                >
                  <CardSwap
                    ref={cardSwapRef}
                    width="100%"
                    height={cardHeight}
                    cardDistance={32}
                    verticalDistance={26}
                    skewAmount={1.8}
                    autoPlay={false}
                    pauseOnHover={true}
                    isReadingMode={isReadingMode}
                    onFrontChange={(frontIdx) => {
                      setIsReadingMode(false);
                      const frontItem = resumes[frontIdx];
                      if (frontItem) {
                        setSelectedName(frontItem.name);
                      }
                    }}
                  >
                    {resumes.map((item) => (
                      <Card
                        key={item.name}
                        className="w-full rounded-3xl border border-stone-800/80 bg-[#171513] shadow-2xl flex flex-col overflow-hidden select-none"
                        style={{ height: `${cardHeight}px` }}
                      >
                        {renderCardInner(item, false)}
                      </Card>
                    ))}
                  </CardSwap>
                </div>
              ) : (
                /* ================= 2D 纯净平铺模式视图 ================= */
                <div className="w-full space-y-4 pt-1 pb-4 animate-in fade-in duration-150">
                  {/* 平铺模式：横向文件快捷切换标签栏 */}
                  {!flatSpreadAll && resumes.length > 1 && (
                    <div className="w-full flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {resumes.map((item) => {
                        const isSelected = item.name === selectedName;
                        const isImg = isImageExt(item.name);
                        const isPdf = item.name.endsWith(".pdf");
                        return (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => setSelectedName(item.name)}
                            className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer border ${
                              isSelected
                                ? isMonochrome
                                  ? "bg-white text-black border-white shadow-md font-bold"
                                  : "bg-amber-500/20 text-amber-200 border-amber-500/60 shadow-sm shadow-amber-500/10 font-bold"
                                : "bg-stone-900/80 text-stone-400 border-stone-800 hover:text-stone-200 hover:border-stone-700"
                            }`}
                          >
                            {isImg ? (
                              <ImageIcon className="size-3.5 text-purple-400 shrink-0" />
                            ) : isPdf ? (
                              <FileText className="size-3.5 text-red-400 shrink-0" />
                            ) : (
                              <FileSpreadsheet className="size-3.5 text-blue-400 shrink-0" />
                            )}
                            <span className="truncate max-w-[160px]">{item.name}</span>
                            <span className="text-[10px] opacity-60 font-mono">
                              {formatSize(item.size)}
                            </span>
                            {item.is_default && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                  isSelected
                                    ? isMonochrome
                                      ? "bg-black text-white"
                                      : "bg-amber-500 text-stone-950"
                                    : "bg-amber-500/20 text-amber-400"
                                }`}
                              >
                                默认
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 平铺主体区 */}
                  {flatSpreadAll ? (
                    /* 多份全部网格平铺 */
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 w-full">
                      {resumes.map((item) => (
                        <div
                          key={item.name}
                          className={`w-full rounded-3xl border shadow-xl flex flex-col overflow-hidden transition-all ${
                            item.name === selectedName
                              ? isMonochrome
                                ? "border-white/40 ring-1 ring-white/20 bg-[#141416]"
                                : "border-amber-500/50 ring-1 ring-amber-500/20 bg-[#161414]"
                              : "border-stone-800/80 bg-[#151312]"
                          }`}
                          style={{ height: `${cardHeight}px` }}
                          onClick={() => setSelectedName(item.name)}
                        >
                          {renderCardInner(item, true)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* 单份 2D 纯平大视窗 */
                    (() => {
                      const activeItem =
                        resumes.find((r) => r.name === selectedName) || resumes[0];
                      if (!activeItem) return null;
                      return (
                        <div
                          className="w-full rounded-3xl border border-stone-800/80 bg-[#151312] shadow-2xl flex flex-col overflow-hidden"
                          style={{ height: `${cardHeight}px` }}
                        >
                          {renderCardInner(activeItem, true)}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* 底部高度自定义拉伸手柄 (受整个软件窗口底部边界约束，超出时告警并在松手后贴底) */}
              <div className="w-full flex flex-col items-center justify-center pt-2 pb-1 select-none">
                <div
                  onMouseDown={handleResizeStart}
                  className={`group flex items-center justify-center gap-2.5 py-1.5 px-6 rounded-full border transition-all cursor-ns-resize shadow-sm ${
                    isResizingHeight
                      ? isExceedingMax
                        ? "border-red-500 bg-red-500/15 text-red-300 shadow-red-500/20 animate-pulse"
                        : isMonochrome
                        ? "border-white bg-white/10 text-white shadow-white/10 ring-2 ring-white/20"
                        : "border-amber-400 bg-amber-500/20 text-amber-200 shadow-amber-500/20 ring-2 ring-amber-500/20"
                      : "border-stone-800/90 bg-stone-900/90 text-stone-500 hover:text-stone-300 hover:border-stone-600 hover:bg-stone-800/90"
                  }`}
                  title="向下拖动可拉长视窗高度，向上拖动可缩小（双击重置默认高度 640px）"
                  onDoubleClick={() => {
                    setCardHeight(DEFAULT_CARD_HEIGHT);
                    try {
                      localStorage.setItem("boss_resumes_card_height", DEFAULT_CARD_HEIGHT.toString());
                    } catch {}
                    notify({ type: "info", text: "已重置视窗为默认高度 (640px)", source: "视窗调整" });
                  }}
                >
                  <div className="w-6 h-0.5 rounded-full bg-current opacity-40 group-hover:opacity-80 transition-opacity" />
                  <span className="text-[11px] font-mono font-medium flex items-center gap-1.5">
                    {isExceedingMax ? (
                      <span className="text-red-400 font-bold flex items-center gap-1">
                        <AlertCircle className="size-3.5" />
                        <span>已超出界面最大限制 (松手自动贴底)</span>
                      </span>
                    ) : (
                      <span>↕ 拖拽调整视窗高度 ({cardHeight}px)</span>
                    )}
                  </span>
                  <div className="w-6 h-0.5 rounded-full bg-current opacity-40 group-hover:opacity-80 transition-opacity" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 辅助方法：读取本地 File 转为 Base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}

// 辅助方法：创建本地二进制安全的 Blob URL
function createBlobUrl(dataUrl: string, mime: string): string {
  try {
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    let cleanB64 = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (cleanB64.length % 4) cleanB64 += "=";
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("Blob conversion failed, fallback to data url:", err);
    return dataUrl;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

function isImageExt(name: string): boolean {
  const ext = getExtension(name);
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}
