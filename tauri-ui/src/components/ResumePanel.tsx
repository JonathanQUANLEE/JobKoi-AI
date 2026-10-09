import { useCallback, useEffect, useState, useRef, type ChangeEvent, type DragEvent } from "react";
import {
  FileText,
  RefreshCw,
  UploadCloud,
  Star,
  Info,
  Trash2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  FileCheck,
  Image as ImageIcon,
  ChevronRight,
  Eye,
  AlertCircle,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { ipc, type ResumeItem, type ResumeContentResult } from "../lib/ipc";
import { useT } from "../store";
import { MagicCard } from "./core/MagicBento";
import EnergyCapsule from "./core/EnergyCapsule";
import ResumeDrawerStack from "./core/ResumeDrawerStack";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

export default function ResumePanel({ onExtractProfile, onGoToProfile }: ResumePanelProps) {
  const t = useT();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  
  // 选中的文件名与内容
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<ResumeContentResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  
  // 安全的本地 Blob URL（彻底解决 WebView2 下 Data URI 无法预览 PDF / 图片截断问题）
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // 能量胶囊充盈进度条状态
  const [chargingProgress, setChargingProgress] = useState<number | null>(null);
  const [chargingStatus, setChargingStatus] = useState<string>("");

  // 图片缩放控制
  const [imgZoom, setImgZoom] = useState<number>(1);

  // 拖拽上传与文件选择
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 当选中文件改变时拉取内容并转换为本地 Blob URL
  useEffect(() => {
    if (!selectedName) {
      setPreviewContent(null);
      setPreviewError(null);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);

    ipc.getResumeContent(selectedName)
      .then((data) => {
        if (!active) return;
        setPreviewContent(data);
        setPreviewError(null);

        // 将 Base64 转换为本地 Blob URL，彻底解决 WebView2 预览限制
        if (data.data_url) {
          const newBlobUrl = createBlobUrl(data.data_url, data.mime);
          setBlobUrl((oldUrl) => {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            return newBlobUrl;
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error(`无法获取简历内容 [${selectedName}]:`, err);
        setPreviewContent(null);
        setPreviewError(String(err));
        setMessage({ type: "error", text: `无法预览 ${selectedName}（${String(err)}）` });
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedName]);

  // 组件卸载时释放 Blob 内存
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

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
      if (selectedName === name) {
        setSelectedName(null);
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
    
    // 进度充盈动画步进
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

  const selectedItem = resumes.find((r) => r.name === selectedName);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 消息通知气泡 */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-xs border transition-all ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
              : message.type === "error"
                ? "border-red-500/30 bg-red-950/40 text-red-300"
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

      {/* 核心左右 Master-Detail 分栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= 左侧：资产档案目录与 3D 抽屉层叠 (5 列) ================= */}
        <div className="lg:col-span-5 space-y-4">
          <MagicCard
            className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-4 shadow-sm space-y-4"
            glowColor="245, 158, 11"
            enableTilt={false}
          >
            {/* 顶栏操作 */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
              <div className="flex items-center gap-2">
                <FileCheck className="size-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  资料资产档案 ({resumes.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn-ghost text-xs flex items-center gap-1 py-1 px-2.5 rounded-lg border border-[var(--grid)] hover:border-amber-500/40 cursor-pointer"
                  onClick={refresh}
                  disabled={busy}
                  title="刷新文件列表"
                >
                  <RefreshCw className={`size-3 ${busy ? "animate-spin text-amber-400" : ""}`} />
                  <span className="text-[11px]">{t("resume.refresh")}</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs py-1 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold hover:from-amber-400 hover:to-amber-500 shadow-sm cursor-pointer active:scale-95 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  <UploadCloud className="size-3.5" />
                  <span>上传资料 +</span>
                </button>
              </div>
            </div>

            {/* 当正在入库或上传时：展示荧光绿能量胶囊拉满特效！ */}
            {chargingProgress !== null && (
              <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 backdrop-blur-md shadow-lg shadow-emerald-500/10 animate-in fade-in zoom-in-95 duration-200">
                <EnergyCapsule
                  progress={chargingProgress}
                  statusText={chargingStatus}
                  isCharging={true}
                />
              </div>
            )}

            {/* 拖拽放置热区 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border border-dashed p-3.5 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-amber-400 bg-amber-500/15 scale-[1.01]"
                  : "border-[var(--grid)] bg-[var(--panel-2)]/40 hover:border-amber-500/40 hover:bg-[var(--panel-hover)]"
              }`}
            >
              <UploadCloud className="mx-auto size-5 text-stone-500 mb-1" />
              <p className="text-xs font-medium text-stone-300">
                点击或拖拽文件入库
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">
                支持 PDF、Word (.docx)、学信网截图与证书图片
              </p>
            </div>

            {/* 3D 抽屉层叠与平铺切换组件 (ResumeDrawerStack) */}
            {resumes.length === 0 ? (
              <div className="text-center py-8 text-stone-500 text-xs">
                资料库尚无文件，请点击上方按钮入库
              </div>
            ) : (
              <ResumeDrawerStack
                items={resumes}
                selectedName={selectedName}
                onSelect={(item) => setSelectedName(item.name)}
                onSetDefault={handleSetDefault}
                onDelete={handleDeleteFile}
              />
            )}
          </MagicCard>

          {/* ================= 平台投递风控机制说明看板 ================= */}
          <MagicCard
            className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-stone-900/90 to-[#141210] p-4 text-xs text-stone-300 space-y-2.5 shadow-sm"
            glowColor="245, 158, 11"
            enableTilt={false}
          >
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <ShieldAlert className="size-4 shrink-0" />
              <span>平台投递风控机制说明（安全规范）</span>
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              部分求职者以为初次打招呼能直接发送简历文件，但 <span className="text-amber-300 font-semibold">BOSS直聘等平台</span> 严禁陌生会话直接灌附件，属于高危触发拦截行为。
            </p>

            <div className="space-y-1.5 pt-1 border-t border-stone-800/80 text-[11px]">
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">1</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">初次触达</strong>：以真诚口吻发送针对性打招呼语，HR 实时查阅<strong>平台在线微简历</strong>。
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">2</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">意向产生</strong>：HR 回复或表达意向后，系统方可合规发起<strong>“发送简历文件附件”</strong>。
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">3</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">本地私密</strong>：文件仅保存在本地沙箱，模拟真实人类操作间隔，确保账号长期安全。
                </span>
              </div>
            </div>
          </MagicCard>
        </div>

        {/* ================= 右侧：自适应无缝可视化预览舱 (7 列) ================= */}
        <div className="lg:col-span-7 space-y-4">
          <MagicCard
            className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-5 shadow-sm min-h-[580px] flex flex-col"
            glowColor="245, 158, 11"
            enableTilt={false}
          >
            {selectedItem ? (
              <>
                {/* 预览顶栏：文件名与核心操作 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--grid)]">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <Eye className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-stone-100 truncate max-w-[260px] sm:max-w-[340px]">
                          {selectedItem.name}
                        </h3>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase bg-stone-800 text-stone-400 border border-stone-700">
                          {getExtension(selectedItem.name)}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-500 mt-0.5">
                        {selectedItem.mtime} · {formatSize(selectedItem.size)}
                      </p>
                    </div>
                  </div>

                  {/* 动作按钮组 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 一键基于此简历提炼画像 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onExtractProfile) {
                          onExtractProfile(selectedItem.name, previewContent?.text);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/15 cursor-pointer active:scale-95 transition-all"
                      title="呼唤 AI 顾问，根据此简历智能识别求职画像"
                    >
                      <Sparkles className="size-3.5" />
                      <span>提炼画像</span>
                    </button>

                    {/* 设为默认 */}
                    {!selectedItem.is_default ? (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(selectedItem.name)}
                        disabled={busy}
                        className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 cursor-pointer"
                        title="设为投递时优先使用的默认简历"
                      >
                        <Star className="size-3.5 text-stone-400" />
                        <span>设为默认</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        <span>当前默认</span>
                      </span>
                    )}

                    {/* 外部下载/打开原件链接 */}
                    {blobUrl && (
                      <a
                        href={blobUrl}
                        download={selectedItem.name}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg border border-stone-800 bg-stone-900/60 hover:border-amber-500/40 text-stone-400 hover:text-stone-200 transition-all cursor-pointer"
                        title="下载或在浏览器新标签页打开"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}

                    {/* 删除按钮 */}
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(selectedItem.name)}
                      disabled={busy}
                      className="p-1.5 rounded-lg border border-stone-800 bg-stone-900/60 hover:border-red-500/40 hover:text-red-400 text-stone-500 transition-all cursor-pointer"
                      title="从资料库移除"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                {/* 预览视口 (Adaptive Viewport) */}
                <div className="flex-1 w-full flex flex-col justify-center">
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-stone-500 text-xs">
                      <RefreshCw className="size-7 animate-spin text-amber-500/60 mb-2.5" />
                      <span>正在加载并转换本地渲染数据流...</span>
                    </div>
                  ) : previewContent ? (
                    <div className="w-full flex-1">
                      {/* 1. PDF 预览 (支持 WebView2 内置 PDF 插件渲染) */}
                      {previewContent.ext === ".pdf" && (
                        <div className="w-full h-full flex flex-col">
                          <iframe
                            src={blobUrl || previewContent.data_url}
                            className="w-full h-[620px] rounded-xl border border-stone-800 bg-[#2b2b2b] shadow-inner"
                            title={previewContent.name}
                          />
                        </div>
                      )}

                      {/* 2. 图片预览 (学信网截图 / 技能证书 / 作品集) */}
                      {["png", "jpg", "jpeg", "webp"].includes(previewContent.ext.replace(".", "")) && (
                        <div className="flex flex-col items-center justify-center p-4 bg-stone-950/70 rounded-xl border border-stone-800/80 min-h-[520px] max-h-[660px] overflow-auto relative group">
                          {/* 图片缩放控制浮标 */}
                          <div className="absolute top-3 right-3 flex items-center gap-1 bg-stone-900/80 backdrop-blur border border-stone-700/60 rounded-lg p-1 opacity-80 group-hover:opacity-100 transition-opacity z-10">
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

                          <img
                            src={blobUrl || previewContent.data_url}
                            alt={previewContent.name}
                            style={{ transform: `scale(${imgZoom})`, transformOrigin: "center top" }}
                            className="max-w-full max-h-[580px] object-contain rounded-lg shadow-2xl border border-stone-800 transition-transform duration-150"
                          />
                          <p className="mt-3 text-[11px] text-stone-400 flex items-center gap-1.5">
                            <ImageIcon className="size-3.5 text-purple-400" />
                            <span>证明材料高清预览 · 适合学信网报告、毕业证书与作品图核对</span>
                          </p>
                        </div>
                      )}

                      {/* 3. Word 文档提取预览 (.docx / .doc) */}
                      {["docx", "doc"].includes(previewContent.ext.replace(".", "")) && (
                        <div className="rounded-xl border border-stone-800/80 bg-[#191715] p-6 max-h-[620px] overflow-y-auto leading-relaxed text-stone-200">
                          <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800 text-xs">
                            <span className="flex items-center gap-2 text-blue-400 font-semibold">
                              <FileText className="size-4" />
                              <span>Word 文档文本提取视图（免跳出 WPS/Office）</span>
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              UTF-8 Native Extractor
                            </span>
                          </div>

                          {previewContent.text ? (
                            <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-stone-200 select-text">
                              {previewContent.text}
                            </pre>
                          ) : (
                            <div className="py-12 text-center text-stone-500 text-xs">
                              <p>未能提取到纯文本段落（文档可能主要包含嵌入图片或旧版二进制 doc 格式）</p>
                              <p className="text-[10px] text-stone-600 mt-1">推荐另存为标准 PDF 格式以获得完整板式预览</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-stone-500 text-xs">
                      <AlertCircle className="mx-auto size-8 text-amber-500/80 mb-2" />
                      <p className="text-stone-300 font-medium mb-1">未能成功读取该文件内容</p>
                      {previewError && (
                        <p className="text-[11px] text-red-400/90 font-mono mt-1 max-w-md mx-auto bg-stone-900/80 p-2.5 rounded-lg border border-stone-800 break-all">
                          {previewError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedName) {
                            const n = selectedName;
                            setSelectedName(null);
                            setTimeout(() => setSelectedName(n), 30);
                          }
                        }}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs cursor-pointer transition-colors"
                      >
                        重试加载
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* 空选择状态引导 */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-stone-500">
                <div className="size-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                  <FileText className="size-7" />
                </div>
                <h4 className="text-sm font-bold text-stone-200 mb-1">
                  选择左侧文件开启即时可视化预览
                </h4>
                <p className="text-xs text-stone-400 max-w-sm leading-relaxed mb-4">
                  支持免跳出预览 PDF、Word 与证书长图，点击上方“提炼画像”即可让 AI 顾问基于该份材料智能生成目标岗位与匹配关键词。
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-[var(--grid)] bg-[#1c1917] hover:border-amber-500/40 text-xs text-stone-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="size-3.5 text-amber-400" />
                  <span>上传新简历或学信网截图</span>
                </button>
              </div>
            )}
          </MagicCard>
        </div>
      </div>
    </div>
  );
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

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

function createBlobUrl(dataUrl: string, mime: string): string {
  try {
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const cleanB64 = b64.replace(/\s+/g, "");
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
