import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  UploadCloud,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { useRunStore } from "../store";
import type { ResumeItem } from "../lib/ipc";
import { isImageExt, formatSize } from "../lib/resumeUtils";
import { useResumeVault } from "../hooks/useResumeVault";
import { useResumeHeightResize } from "../hooks/useResumeHeightResize";
import EnergyCapsule from "./core/EnergyCapsule";
import CardSwap, { Card, type CardSwapHandle } from "./core/CardSwap";
import ResumeSidebar from "./resume/ResumeSidebar";
import ResumeCardViewer from "./resume/ResumeCardViewer";
import ResumeStageControls from "./resume/ResumeStageControls";
import ResumeHeightHandle from "./resume/ResumeHeightHandle";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

export default function ResumePanel({
  onExtractProfile,
}: ResumePanelProps) {
  const isMonochrome = useRunStore((s) => s.theme === "monochrome");

  // 1. 数据资产管理与 IPC 状态
  const {
    resumes,
    busy,
    selectedName,
    setSelectedName,
    contentsCache,
    blobCache,
    chargingProgress,
    chargingStatus,
    refresh,
    handleSetDefault,
    handleOpenNative,
    handleDeleteConfirmed,
    handleUploadFiles,
  } = useResumeVault();

  // 2. 视窗高度垂直拖拽与物理边界算法
  const {
    stageRef,
    cardHeight,
    isResizingHeight,
    isExceedingMax,
    handleResizeStart,
    resetDefaultHeight,
  } = useResumeHeightResize();

  // 3. 本地交互视图状态
  const [viewMode, setViewMode] = useState<"3d" | "flat">("3d");
  const [flatSpreadAll, setFlatSpreadAll] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardSwapRef = useRef<CardSwapHandle>(null);

  // 视图切换处理
  const handleViewModeChange = (mode: "3d" | "flat") => {
    setViewMode(mode);
    setIsReadingMode(false);
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

  // 全局拖拽文件入库
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // 点击列表项联动最前与重置阅读态
  const handleItemSelect = (name: string, index: number) => {
    setIsReadingMode(false);
    setSelectedName(name);
    if (viewMode === "3d") {
      cardSwapRef.current?.bringToFront(index);
    }
  };

  // 统一渲染单份卡片预览器
  const renderViewer = (item: ResumeItem, isFlat: boolean) => (
    <ResumeCardViewer
      item={item}
      isFlat={isFlat}
      content={contentsCache[item.name]}
      blobUrl={blobCache[item.name]}
      isReadingMode={isReadingMode}
      isMonochrome={isMonochrome}
      busy={busy}
      imgZoom={imgZoom}
      setImgZoom={setImgZoom}
      onSetReadingMode={setIsReadingMode}
      onOpenNative={handleOpenNative}
      onExtractProfile={onExtractProfile}
      onSetDefault={handleSetDefault}
      onDeleteConfirmed={handleDeleteConfirmed}
    />
  );

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

      {/* 荧光绿能量胶囊拉满入库特效 */}
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

      {/* 左右经典主从分栏 (Left Sidebar + Right Stage) */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* 左侧紧凑型资料资产面板 */}
        <ResumeSidebar
          resumes={resumes}
          selectedName={selectedName}
          busy={busy}
          isDragging={isDragging}
          onRefresh={refresh}
          onOpenUpload={() => fileInputRef.current?.click()}
          onSelect={handleItemSelect}
          onDelete={handleDeleteConfirmed}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />

        {/* 右侧核心大舞台 */}
        <div
          ref={stageRef}
          className="flex-1 min-w-0 w-full flex flex-col items-center justify-start relative overflow-visible"
          onClick={() => {
            if (isReadingMode) setIsReadingMode(false);
          }}
        >
          {/* 舞台顶栏操作区 */}
          <ResumeStageControls
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            isReadingMode={isReadingMode}
            onExitReadingMode={() => setIsReadingMode(false)}
            isMonochrome={isMonochrome}
            resumesCount={resumes.length}
            onSwap={() => {
              setIsReadingMode(false);
              cardSwapRef.current?.swap();
            }}
            flatSpreadAll={flatSpreadAll}
            onSetFlatSpreadAll={setFlatSpreadAll}
          />

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
                /* 3D 书架抽屉层叠视图 */
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
                        {renderViewer(item, false)}
                      </Card>
                    ))}
                  </CardSwap>
                </div>
              ) : (
                /* 2D 纯净平铺模式视图 */
                <div className="w-full space-y-4 pt-1 pb-4 animate-in fade-in duration-150">
                  {/* 横向快捷切换标签栏 */}
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
                          {renderViewer(item, true)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    (() => {
                      const activeItem =
                        resumes.find((r) => r.name === selectedName) || resumes[0];
                      if (!activeItem) return null;
                      return (
                        <div
                          className="w-full rounded-3xl border border-stone-800/80 bg-[#151312] shadow-2xl flex flex-col overflow-hidden"
                          style={{ height: `${cardHeight}px` }}
                        >
                          {renderViewer(activeItem, true)}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* 底部拉伸物理手柄 */}
              <ResumeHeightHandle
                cardHeight={cardHeight}
                isResizingHeight={isResizingHeight}
                isExceedingMax={isExceedingMax}
                isMonochrome={isMonochrome}
                onResizeStart={handleResizeStart}
                onResetDefault={resetDefaultHeight}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
