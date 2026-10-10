import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { UploadCloud, FolderOpen } from "lucide-react";
import { useRunStore } from "../store";
import type { ResumeItem } from "../lib/ipc";
import { useResumeVault } from "../hooks/useResumeVault";
import { useResumeHeightResize } from "../hooks/useResumeHeightResize";
import type { CardSwapHandle } from "./core/CardSwap";
import EnergyCapsule from "./core/EnergyCapsule";
import ResumeSidebar from "./resume/ResumeSidebar";
import ResumeCardViewer from "./resume/ResumeCardViewer";
import ResumeStageControls from "./resume/ResumeStageControls";
import ResumeHeightHandle from "./resume/ResumeHeightHandle";
import ResumeFlatView from "./resume/ResumeFlatView";
import Resume3DView from "./resume/Resume3DView";

interface ResumePanelProps {
  onExtractProfile?: (resumeName: string, text?: string) => void;
  onReviewResume?: (resumeName: string, text?: string) => void;
  onGoToProfile?: () => void;
}

export default function ResumePanel({
  onExtractProfile,
  onReviewResume,
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

  const lastFlatWheelTimeRef = useRef<number>(0);

  // 平铺模式下滚轮抽换卡片（在外部轮廓、顶栏、底栏滚动时切换简历；在正文区滚动时留给正文阅读）
  const handleFlatWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;

    if (
      isReadingMode ||
      target?.closest(
        ".reading-content-zone, .allow-inner-scroll, [data-allow-scroll], textarea, input, pre"
      )
    ) {
      return;
    }

    if (flatSpreadAll || resumes.length <= 1) {
      return;
    }

    if (Math.abs(e.deltaY) < 14) return;

    const now = performance.now();
    if (now - lastFlatWheelTimeRef.current < 260) return;
    lastFlatWheelTimeRef.current = now;

    e.preventDefault();
    e.stopPropagation();

    const currentIndex = resumes.findIndex((r) => r.name === selectedName);
    const validIndex = currentIndex >= 0 ? currentIndex : 0;

    if (e.deltaY > 0) {
      const nextIdx = (validIndex + 1) % resumes.length;
      setSelectedName(resumes[nextIdx].name);
    } else if (e.deltaY < 0) {
      const prevIdx = (validIndex - 1 + resumes.length) % resumes.length;
      setSelectedName(resumes[prevIdx].name);
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
      onReviewResume={onReviewResume}
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
                <Resume3DView
                  cardSwapRef={cardSwapRef}
                  cardHeight={cardHeight}
                  resumes={resumes}
                  isReadingMode={isReadingMode}
                  setIsReadingMode={setIsReadingMode}
                  setSelectedName={setSelectedName}
                  renderViewer={renderViewer}
                />
              ) : (
                <ResumeFlatView
                  resumes={resumes}
                  selectedName={selectedName}
                  setSelectedName={setSelectedName}
                  flatSpreadAll={flatSpreadAll}
                  cardHeight={cardHeight}
                  isMonochrome={isMonochrome}
                  onWheel={handleFlatWheel}
                  renderViewer={renderViewer}
                />
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
