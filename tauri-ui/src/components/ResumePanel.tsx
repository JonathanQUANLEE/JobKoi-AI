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
  FolderOpen,
  ShieldCheck,
  FileCheck,
  AlertCircle,
  X,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { ipc, type ResumeItem, type ResumeContentResult } from "../lib/ipc";
import { useT } from "../store";
import { MagicCard } from "./core/MagicBento";
import EnergyCapsule from "./core/EnergyCapsule";
import CardSwap, { Card, type CardSwapHandle } from "./core/CardSwap";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

export default function ResumePanel({
  onExtractProfile,
  onGoToProfile,
}: ResumePanelProps) {
  const t = useT();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // 选中的/处于最前方的文件名
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // 缓存所有文件的内容与 Blob URL，供 3D 书架抽屉堆叠卡片即时展示
  const [contentsCache, setContentsCache] = useState<Record<string, ResumeContentResult>>({});
  const [blobCache, setBlobCache] = useState<Record<string, string>>({});
  const [loadingCache, setLoadingCache] = useState<Record<string, boolean>>({});

  // 能量胶囊充盈进度条状态
  const [chargingProgress, setChargingProgress] = useState<number | null>(null);
  const [chargingStatus, setChargingStatus] = useState<string>("");

  // 图片缩放控制 (按文件名分别维护或全局)
  const [imgZoom, setImgZoom] = useState<number>(1);

  // 拖拽上传与文件选择
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CardSwap 引用，支持联动控制
  const cardSwapRef = useRef<CardSwapHandle>(null);

  // 平台风控说明轻量浮窗气泡开关
  const [riskModalOpen, setRiskModalOpen] = useState(false);

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
      setMessage({ type: "error", text: t("resume.loadFailed", { error: String(err) }) });
    } finally {
      setBusy(false);
    }
  }, [t]);

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
    setMessage(null);
    try {
      await ipc.setDefaultResume(name);
      await refresh();
      setMessage({ type: "success", text: t("resume.defaultSet", { name }) });
    } catch (err) {
      setMessage({ type: "error", text: t("resume.setFailed", { error: String(err) }) });
    } finally {
      setBusy(false);
    }
  }

  // 一键系统原生软件直开（调起本地 WPS / Word / 系统照片查看器等）
  async function handleOpenNative(name: string) {
    try {
      await ipc.openResumeNative(name);
      setMessage({ type: "success", text: `已调起系统原生软件打开「${name}」` });
    } catch (err) {
      setMessage({ type: "error", text: `无法调起原版程序: ${String(err)}` });
    }
  }

  // 删除文件
  async function handleDeleteFile(name: string) {
    if (!window.confirm(`确定要从简历资料库中移除「${name}」吗？`)) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await ipc.deleteResumeFile(name);
      setMessage({ type: "success", text: `已成功删除「${name}」` });
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
      setMessage({ type: "error", text: `删除失败: ${String(err)}` });
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
    setMessage(null);

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
      setMessage({ type: "success", text: `成功将 ${files.length} 份资料入库至本地资料库` });
    } catch (err) {
      console.error("上传文件入库失败:", err);
      setMessage({ type: "error", text: `上传入库失败: ${String(err)}` });
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

  // 点击顶部胶囊导航切换文件时，联动将 CardSwap 抽到最前
  const handlePillSelect = (name: string, index: number) => {
    setSelectedName(name);
    cardSwapRef.current?.bringToFront(index);
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

      {/* 消息通知横条 */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-2 text-xs border transition-all ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/60 text-emerald-300"
              : message.type === "error"
              ? "border-red-500/30 bg-red-950/60 text-red-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="size-4 shrink-0 text-amber-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            type="button"
            className="text-[11px] underline opacity-70 hover:opacity-100 ml-4 cursor-pointer"
            onClick={() => setMessage(null)}
          >
            关闭
          </button>
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

      {/* ================= 顶部极简联动工具条 (Compact Linked Bar) ================= */}
      {/* 彻底做小、做成联动，把 90% 以上空间留给下方的 3D 书架抽屉实体资料内容 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-2xl border border-[var(--grid)] bg-[#141210]/90 backdrop-blur-md shadow-sm">
        {/* 左侧：资料库档案联动胶囊组 */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 max-w-full">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-900 border border-stone-800 shrink-0">
            <Layers className="size-3.5 text-amber-400" />
            <span className="text-xs font-bold text-stone-200">
              资料档案 ({resumes.length})
            </span>
          </div>

          {/* 各文件联动小药丸 */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {resumes.map((item, idx) => {
              const isFront = item.name === selectedName;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => handlePillSelect(item.name, idx)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer shrink-0 select-none ${
                    isFront
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                      : "bg-stone-900/80 text-stone-400 hover:text-stone-200 border border-stone-800/80 hover:border-stone-700"
                  }`}
                  title={`点击在 3D 抽屉中将 ${item.name} 抽至最前`}
                >
                  {isImageExt(item.name) ? (
                    <ImageIcon className="size-3 text-purple-400 shrink-0" />
                  ) : item.name.endsWith(".pdf") ? (
                    <FileText className="size-3 text-red-400 shrink-0" />
                  ) : (
                    <FileSpreadsheet className="size-3 text-blue-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">{item.name}</span>
                  {item.is_default && (
                    <Star className="size-2.5 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧：紧凑操作按钮群 */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* 3D 抽屉抽换按钮 */}
          {resumes.length > 1 && (
            <button
              type="button"
              onClick={() => cardSwapRef.current?.swap()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
              title="像从书架抽书/抽屉抽拉一样切换下一张"
            >
              <RotateCw className="size-3.5 text-amber-400" />
              <span>抽换下一份 (Swap)</span>
            </button>
          )}

          {/* 刷新 */}
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="p-1.5 rounded-xl border border-stone-800 bg-stone-900 hover:border-amber-500/40 text-stone-400 hover:text-stone-200 transition-all cursor-pointer"
            title="刷新文件列表"
          >
            <RefreshCw className={`size-3.5 ${busy ? "animate-spin text-amber-400" : ""}`} />
          </button>

          {/* 上传资料 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 cursor-pointer active:scale-95 transition-all"
          >
            <UploadCloud className="size-3.5" />
            <span>上传资料 +</span>
          </button>

          {/* 平台投递风控机制说明 (做成轻量小气泡浮标，不占主体空间) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRiskModalOpen(!riskModalOpen)}
              className="p-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer"
              title="平台投递风控机制说明（安全规范）"
            >
              <ShieldAlert className="size-3.5" />
            </button>

            {riskModalOpen && (
              <div className="absolute top-10 right-0 w-80 rounded-2xl border border-amber-500/30 bg-[#191614] p-4 text-xs text-stone-300 shadow-2xl z-50 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <ShieldCheck className="size-4" />
                    <span>平台投递风控机制说明</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setRiskModalOpen(false)}
                    className="text-stone-400 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  BOSS直聘等主流平台严禁初次会话灌输附件文件：
                </p>
                <div className="space-y-1.5 text-[11px] text-stone-300">
                  <p>1. <strong>初次触达</strong>：以真诚口吻打招呼，HR 查阅在线微简历；</p>
                  <p>2. <strong>意向产生</strong>：HR 回复表达意向后，系统合规发起发送附件；</p>
                  <p>3. <strong>本地私密</strong>：文件仅保存在本地沙箱，保障账号长期安全。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= 核心主体：3D 书架抽屉层叠大舞台 (Main Document Stage) ================= */}
      {/* 占据整页主体，层层叠叠，每一张卡片都是真实完整的文件大视窗，点击即可像抽屉一样抽拉 */}
      {resumes.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-[520px] rounded-3xl border-2 border-dashed border-stone-800 hover:border-amber-500/40 bg-[#161412]/50 flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all hover:bg-[#161412]"
        >
          <FolderOpen className="size-16 text-stone-600 mb-3" />
          <h3 className="text-base font-bold text-stone-200">资料库尚无文件</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm">
            点击此处或拖拽 PDF、Word、学信网报告、技能证书图片入库，即刻体验 3D 书架层叠大视窗
          </p>
        </div>
      ) : (
        <div className="w-full flex justify-center items-center pt-2 pb-6 overflow-visible">
          <CardSwap
            ref={cardSwapRef}
            width="100%"
            height={640}
            cardDistance={42}
            verticalDistance={34}
            skewAmount={2}
            autoPlay={false}
            pauseOnHover={true}
            onFrontChange={(frontIdx) => {
              const frontItem = resumes[frontIdx];
              if (frontItem) {
                setSelectedName(frontItem.name);
              }
            }}
          >
            {resumes.map((item) => {
              const content = contentsCache[item.name];
              const blobUrl = blobCache[item.name];
              const ext = getExtension(item.name);
              const isImg = isImageExt(item.name);
              const isWord = ext === "docx" || ext === "doc";
              const isPdf = ext === "pdf";

              return (
                <Card
                  key={item.name}
                  className="w-full max-w-4xl h-[620px] rounded-3xl border border-amber-500/25 bg-[#171513] shadow-2xl flex flex-col overflow-hidden select-none"
                >
                  {/* 卡片顶栏：文件核心元信息 + 原版直开 + 提炼画像 + 默认与删除 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-800/80 bg-stone-900/60 shrink-0">
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
                          <h3 className="text-sm font-bold text-stone-100 truncate max-w-[260px] sm:max-w-[420px]">
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
                        title="使用 Windows 默认软件（如 WPS / Office / 系统照片）直接打开原版文件"
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

                      {/* 4. 删除按钮 */}
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(item.name)}
                        disabled={busy}
                        className="p-1.5 rounded-xl border border-stone-800 hover:border-red-500/40 hover:text-red-400 text-stone-500 transition-all cursor-pointer"
                        title="从资料库移除"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 卡片主体：真实高清内容视窗 (100% 留给文件本身) */}
                  <div className="flex-1 w-full p-4 overflow-hidden flex flex-col justify-center items-center bg-[#110f0e] relative">
                    {/* 1. 图片格式 (简历原图、学信网报告、技能证书) */}
                    {isImg && (
                      <div className="w-full h-full flex flex-col items-center justify-center relative group">
                        {/* 悬浮缩放控制栏 */}
                        <div
                          className="absolute top-2 right-2 flex items-center gap-1 bg-stone-900/90 backdrop-blur border border-stone-700/60 rounded-xl p-1 z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setImgZoom((z) => Math.max(0.5, z - 0.2))}
                            className="p-1 hover:text-amber-400 text-stone-400"
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
                            className="p-1 hover:text-amber-400 text-stone-400"
                            title="放大"
                          >
                            <ZoomIn className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setImgZoom(1)}
                            className="p-1 hover:text-amber-400 text-stone-400"
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
                            className="max-w-full max-h-[500px] object-contain rounded-xl shadow-2xl border border-stone-800/80 transition-transform duration-150 select-none pointer-events-auto"
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
                      <div className="w-full h-full flex flex-col text-left">
                        {/* Word 排版温馨引导横条 */}
                        <div
                          className="flex items-center justify-between px-3.5 py-2 mb-3 rounded-xl border border-blue-500/20 bg-blue-950/20 text-xs text-blue-300 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="size-4 text-blue-400" />
                            <span>纯文本提取模式（如需查看 100% 原始精美双栏排版与表格，请点击右侧）</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenNative(item.name)}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-[11px] font-semibold border border-blue-500/30 cursor-pointer"
                          >
                            在 WPS/Word 打开原版 ↗
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto rounded-xl border border-stone-800 bg-[#161412] p-5 leading-relaxed text-stone-200 select-text">
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
                      <div className="w-full h-full flex flex-col">
                        <iframe
                          src={blobUrl || content?.data_url}
                          className="w-full h-[520px] rounded-xl border border-stone-800 bg-[#2b2b2b] shadow-inner"
                          title={item.name}
                        />
                      </div>
                    )}
                  </div>

                  {/* 卡片底栏交互提示 */}
                  <div className="px-5 py-2 bg-stone-900/80 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between shrink-0">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3 text-amber-400" />
                      <span>3D 书架抽屉层叠卡片 · 点击卡片或上方按钮可抽拉下一张</span>
                    </span>
                    <span className="text-stone-500 font-mono text-[10px]">
                      {item.is_default ? "★ 默认投递简历" : "备用投递资料"}
                    </span>
                  </div>
                </Card>
              );
            })}
          </CardSwap>
        </div>
      )}
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
