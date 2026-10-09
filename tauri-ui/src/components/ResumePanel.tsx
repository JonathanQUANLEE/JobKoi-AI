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
  FileSpreadsheet,
  ExternalLink,
  ChevronRight,
  Eye,
  AlertCircle,
} from "lucide-react";
import { ipc, type ResumeItem, type ResumeContentResult } from "../lib/ipc";
import { useT } from "../store";
import { MagicCard } from "./core/MagicBento";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

type FileFilter = "all" | "pdf" | "word" | "image";

export default function ResumePanel({ onExtractProfile, onGoToProfile }: ResumePanelProps) {
  const t = useT();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  
  // 当前选中预览的文件
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<ResumeContentResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 筛选与拖拽状态
  const [filter, setFilter] = useState<FileFilter>("all");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载简历列表
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await ipc.listResumes();
      setResumes(result.resumes);
      
      // 若当前没有选中项，或选中项已被删除，默认选中默认简历或第一个文件
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

  // 当选中文件名改变时，拉取预览内容
  useEffect(() => {
    if (!selectedName) {
      setPreviewContent(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);

    ipc.getResumeContent(selectedName)
      .then((data) => {
        if (active) {
          setPreviewContent(data);
        }
      })
      .catch((err) => {
        if (active) {
          setPreviewContent(null);
          setMessage({ type: "error", text: `无法预览 ${selectedName}: ${String(err)}` });
        }
      })
      .finally(() => {
        if (active) {
          setPreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedName]);

  // 设置默认简历
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

  // 处理文件上传（支持多选）
  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setMessage(null);
    let successCount = 0;
    let failCount = 0;
    let lastUploadedName = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64Data = await readFileAsBase64(file);
        await ipc.saveResumeFile(file.name, base64Data);
        successCount++;
        lastUploadedName = file.name;
      } catch (err) {
        console.error(`上传 ${file.name} 失败:`, err);
        failCount++;
      }
    }

    await refresh();
    if (lastUploadedName) {
      setSelectedName(lastUploadedName);
    }

    if (failCount === 0) {
      setMessage({ type: "success", text: `成功上传并入库 ${successCount} 份资料文件` });
    } else {
      setMessage({
        type: "error",
        text: `上传完成：成功 ${successCount} 份，失败 ${failCount} 份（请检查格式是否为 PDF/Word/图片）`,
      });
    }
    setBusy(false);
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

  // 筛选过滤
  const filteredResumes = resumes.filter((item) => {
    const ext = getExtension(item.name).toLowerCase();
    if (filter === "pdf") return ext === "pdf";
    if (filter === "word") return ext === "docx" || ext === "doc";
    if (filter === "image") return ["png", "jpg", "jpeg", "webp"].includes(ext);
    return true;
  });

  const selectedItem = resumes.find((r) => r.name === selectedName);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 消息提示气泡 */}
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

      {/* 左右分栏核心架构 (Master-Detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= 左侧：资产档案目录与规则引导 (5 列) ================= */}
        <div className="lg:col-span-5 space-y-4">
          <MagicCard
            className="rounded-2xl border border-[var(--grid)] bg-[var(--panel)] p-4 shadow-sm space-y-3.5"
            glowColor="245, 158, 11"
            enableTilt={false}
          >
            {/* 顶栏操作 */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--grid)]">
              <div className="flex items-center gap-2">
                <FileCheck className="size-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  资料资产库 ({resumes.length})
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

            {/* 拖拽放置热区 (Drag-and-Drop Dropzone) */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border border-dashed p-4 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
                  : "border-[var(--grid)] bg-[var(--panel-2)]/40 hover:border-amber-500/40 hover:bg-[var(--panel-hover)]"
              }`}
            >
              <UploadCloud className="mx-auto size-6 text-stone-500 mb-1" />
              <p className="text-xs font-medium text-stone-300">
                点击选择或将文件拖拽至此处入库
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">
                支持多选：PDF、Word (.docx)、学信网截图与证书 (PNG/JPG/WEBP)
              </p>
            </div>

            {/* 分类快捷标签 */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto [scrollbar-width:none]">
              <FilterPill
                label="全部"
                count={resumes.length}
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              <FilterPill
                label="PDF 简历"
                count={resumes.filter((r) => getExtension(r.name) === "pdf").length}
                active={filter === "pdf"}
                onClick={() => setFilter("pdf")}
              />
              <FilterPill
                label="Word"
                count={resumes.filter((r) => ["docx", "doc"].includes(getExtension(r.name))).length}
                active={filter === "word"}
                onClick={() => setFilter("word")}
              />
              <FilterPill
                label="图片/凭证"
                count={resumes.filter((r) => ["png", "jpg", "jpeg", "webp"].includes(getExtension(r.name))).length}
                active={filter === "image"}
                onClick={() => setFilter("image")}
              />
            </div>

            {/* 文件列表 (虚拟档案夹) */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredResumes.length === 0 ? (
                <div className="text-center py-8 text-stone-500 text-xs">
                  {resumes.length === 0 ? "资料库尚无文件，请点击上方按钮添加" : "当前分类下无对应文件"}
                </div>
              ) : (
                filteredResumes.map((item) => {
                  const isSelected = selectedName === item.name;
                  const ext = getExtension(item.name);
                  const isImg = ["png", "jpg", "jpeg", "webp"].includes(ext);
                  const isDocx = ["docx", "doc"].includes(ext);

                  return (
                    <div
                      key={item.name}
                      onClick={() => setSelectedName(item.name)}
                      className={`group relative flex items-center justify-between rounded-xl border p-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-amber-500/70 bg-amber-500/10 shadow-sm shadow-amber-500/5 ring-1 ring-amber-500/20"
                          : "border-[var(--grid)] bg-[var(--panel-2)] hover:border-stone-700 hover:bg-[var(--panel-hover)]"
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        {/* 文件类型图标徽章 */}
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                            ext === "pdf"
                              ? "border-red-500/30 bg-red-950/40 text-red-400"
                              : isDocx
                                ? "border-blue-500/30 bg-blue-950/40 text-blue-400"
                                : "border-purple-500/30 bg-purple-950/40 text-purple-400"
                          }`}
                        >
                          {ext === "pdf" ? (
                            "PDF"
                          ) : isDocx ? (
                            "DOC"
                          ) : (
                            <ImageIcon className="size-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-[var(--ink)]">
                              {item.name}
                            </span>
                            {item.is_default && (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-400 border border-amber-500/30"
                                title="当前设定的默认投递简历"
                              >
                                <Star className="size-2.5 fill-amber-400 text-amber-400" />
                                <span>默认</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-500 mt-0.5 flex items-center gap-2">
                            <span>{formatSize(item.size)}</span>
                            <span>·</span>
                            <span>{item.mtime.slice(5)}</span>
                            {isImg && (
                              <span className="text-[9px] text-purple-300 bg-purple-950/50 px-1 rounded">
                                证明/证书
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isSelected && (
                          <span className="text-[10px] text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-500/15">
                            预览中
                          </span>
                        )}
                        <ChevronRight className="size-4 text-stone-600 group-hover:text-stone-300 transition-colors" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </MagicCard>

          {/* ================= 平台投递风控机制说明看板 ================= */}
          <MagicCard
            className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-stone-900/90 to-[#141210] p-4 text-xs text-stone-300 space-y-2.5 shadow-sm"
            glowColor="245, 158, 11"
            enableTilt={false}
          >
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <ShieldAlert className="size-4 shrink-0" />
              <span>平台投递风控机制说明（安全指引）</span>
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              部分求职者希望在初次打招呼时“直接发送附件简历文件”，但在 <span className="text-amber-300 font-semibold">BOSS直聘等主流招聘平台</span>，陌生会话直接灌发文件属于<strong className="text-stone-200">高危触发拦截行为</strong>。
            </p>

            <div className="space-y-1.5 pt-1 border-t border-stone-800/80 text-[11px]">
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">1</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">初次触达</strong>：系统以拟人针对性招呼语开场，HR 此时实时查阅您的<strong>平台在线微简历</strong>。
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">2</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">意向互通</strong>：HR 产生回复或表达阅读意向后，系统方能合规发起<strong>“发送简历文件请求”</strong>。
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="size-4 shrink-0 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">3</span>
                <span className="text-stone-300">
                  <strong className="text-stone-200">本地防封</strong>：资料库文件全程保存在用户电脑本地，模拟真实人类操作间隔，确保账号长期稳定。
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
                {/* 预览顶栏：文件名与核心快捷动作 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--grid)]">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      <Eye className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-stone-100 truncate max-w-[280px] sm:max-w-[360px]">
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
                      <span>正在读取本地文件内容...</span>
                    </div>
                  ) : previewContent ? (
                    <div className="w-full flex-1">
                      {/* 1. PDF 预览 */}
                      {previewContent.ext === ".pdf" && (
                        <div className="w-full h-full flex flex-col">
                          <iframe
                            src={previewContent.data_url}
                            className="w-full h-[620px] rounded-xl border border-stone-800 bg-[#222] shadow-inner"
                            title={previewContent.name}
                          />
                        </div>
                      )}

                      {/* 2. 图片预览 (学信网截图 / 技能证书 / 作品集) */}
                      {["png", "jpg", "jpeg", "webp"].includes(previewContent.ext.replace(".", "")) && (
                        <div className="flex flex-col items-center justify-center p-4 bg-stone-950/70 rounded-xl border border-stone-800/80 min-h-[520px] max-h-[660px] overflow-auto">
                          <img
                            src={previewContent.data_url}
                            alt={previewContent.name}
                            className="max-w-full max-h-[580px] object-contain rounded-lg shadow-2xl border border-stone-800"
                          />
                          <p className="mt-3 text-[11px] text-stone-400 flex items-center gap-1.5">
                            <ImageIcon className="size-3.5 text-purple-400" />
                            <span>证明材料高清预览 · 适合学信网报告、毕业证书与作品图核对</span>
                          </p>
                        </div>
                      )}

                      {/* 3. Word 文档提取预览 (.docx) */}
                      {["docx", "doc"].includes(previewContent.ext.replace(".", "")) && (
                        <div className="rounded-xl border border-stone-800/80 bg-[#191715] p-6 max-h-[620px] overflow-y-auto leading-relaxed text-stone-200">
                          <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800 text-xs">
                            <span className="flex items-center gap-2 text-blue-400 font-semibold">
                              <FileText className="size-4" />
                              <span>Word 文档文本提取视图（免跳出 WPS/Office）</span>
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              UTF-8 Native
                            </span>
                          </div>

                          {previewContent.text ? (
                            <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-stone-200 select-text">
                              {previewContent.text}
                            </pre>
                          ) : (
                            <div className="py-12 text-center text-stone-500 text-xs">
                              <p>未能提取到纯文本段落（文档可能主要包含嵌入图片或旧版二进制 doc 格式）</p>
                              <p className="text-[10px] text-stone-600 mt-1">推荐将简历另存为标准 PDF 格式以获得完整板式预览</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-stone-500 text-xs">
                      <AlertCircle className="mx-auto size-8 text-stone-600 mb-2" />
                      <p>未能成功解析该文件内容</p>
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

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
        active
          ? "bg-amber-500 text-stone-950 font-bold"
          : "bg-stone-900/60 border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-75">({count})</span>
    </button>
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
