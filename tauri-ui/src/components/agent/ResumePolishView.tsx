import { FileText, FileCheck, UploadCloud, Zap } from "lucide-react";
import { useResumeDiagnose } from "./useResumeDiagnose";
import PolishSkillChips from "./PolishSkillChips";
import PolishProgressStage from "./PolishProgressStage";
import AtsScoreDashboard from "./AtsScoreDashboard";
import PolishAdviceCard from "./PolishAdviceCard";
import PolishShowcase from "./PolishShowcase";
import { HaloDropzone, DropzoneUploadFileList } from "../core/HaloDropzone";

interface ResumePolishViewProps {
  getCurrentForm?: () => Record<string, unknown>;
}

export default function ResumePolishView({ getCurrentForm }: ResumePolishViewProps) {
  const {
    resumeText,
    setResumeText,
    targetRole,
    setTargetRole,
    customPrompt,
    setCustomPrompt,
    activeSkills,
    toggleSkill,
    loadedFileName,
    setLoadedFileName,
    atsScore,
    uploadQueue,
    showHaloUpload,
    setShowHaloUpload,
    diagnosing,
    progressPercent,
    elapsedSeconds,
    estimatedSeconds,
    currentStageIndex,
    diagnoseStatus,
    diagnoseResult,
    setDiagnoseResult,
    copied,
    statusMessage,
    polishChatMessages,
    followUpInput,
    setFollowUpInput,
    followUpPending,
    handleHaloFiles,
    handleRemoveQueuedFile,
    handleRunDiagnosis,
    handleCancelDiagnosis,
    handleCopyAdvice,
    handleFollowUpSend,
  } = useResumeDiagnose(getCurrentForm);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">
      {/* -------------------- 左栏 (5 列)：输入与技能控制台 -------------------- */}
      <div className="lg:col-span-5 space-y-4">
        {/* 三步向导（2026-10-13 去黑话：一眼看懂先做什么再做什么） */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-[11px]">
          <span className="font-bold text-amber-300">① 放入你的经历</span>
          <span className="text-stone-600">→</span>
          <span className="font-bold text-amber-300">② 填目标岗位、勾选优化重点</span>
          <span className="text-stone-600">→</span>
          <span className="font-bold text-amber-300">③ 点下方按钮一键精修</span>
        </div>

        {/* 1. 技能包矩阵：精致轻量微光 Pill 芯片 */}
        <PolishSkillChips activeSkills={activeSkills} onToggleSkill={toggleSkill} />

        {/* 2. 简历正文输入与附件载入 */}
        <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 text-amber-400 shrink-0" />
              <span className="font-bold text-stone-200 shrink-0">简历原文 / 重点经历</span>
              {loadedFileName && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 truncate max-w-[130px]">
                  <FileCheck className="size-3 shrink-0" />
                  <span className="truncate">{loadedFileName}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowHaloUpload((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-[11px] text-stone-300 transition-all cursor-pointer border border-stone-700"
                title="展开/折叠简历文件上传区（支持 PDF / Word / 图片）"
              >
                <UploadCloud className="size-3.5 text-amber-400" />
                <span>{showHaloUpload ? "收起上传" : "上传简历文件"}</span>
              </button>
              {resumeText && (
                <button
                  type="button"
                  onClick={() => {
                    setResumeText("");
                    setLoadedFileName(null);
                    setDiagnoseResult(null);
                  }}
                  className="text-[11px] text-stone-500 hover:text-stone-300 px-1"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* Halo Dropzone 动效上传区 */}
          {showHaloUpload && (
            <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
              <HaloDropzone
                onFiles={handleHaloFiles}
                multiple={false}
                formatHint="支持 PDF、Word (.docx)、纯文本与证书图片，带微光渐变解析"
              />
              <DropzoneUploadFileList
                items={uploadQueue}
                onRemove={handleRemoveQueuedFile}
              />
            </div>
          )}

          {/* 文本输入框 */}
          <textarea
            rows={12}
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="在此粘贴完整简历或具体某段项目经历（例如：熟练掌握Java与Spring Boot，主导电商用户中心重构，日活10万，优化SQL使耗时降低40%）..."
            className="w-full resize-y min-h-[260px] rounded-xl bg-stone-950/80 border border-stone-800/80 p-3.5 text-xs leading-relaxed text-stone-200 placeholder:text-stone-600 outline-none focus:border-amber-500/50 transition-all font-mono"
          />

          {/* 目标岗位与侧重输入 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">目标岗位（想应聘的岗位，用于匹配它的关键词）</label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="如：后端工程师 / AI 算法"
                className="w-full rounded-lg bg-stone-950 border border-stone-800 px-2.5 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">重点诉求 (可选)</label>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="如：强化高并发量化成果"
                className="w-full rounded-lg bg-stone-950 border border-stone-800 px-2.5 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* 底部启动按钮 */}
          <div className="pt-1 flex items-center justify-between">
            <span className="text-[10px] text-stone-500">
              字数: {resumeText.length} · {resumeText.length > 30 ? "字数充足" : "建议至少 30 字"}
            </span>

            <button
              type="button"
              onClick={handleRunDiagnosis}
              disabled={diagnosing || !resumeText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="size-3.5 fill-current" />
              <span>{diagnosing ? "正在加速诊断中..." : "开始 AI 深度精修"}</span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <p className="text-xs text-amber-400 px-1">{statusMessage}</p>
        )}
      </div>

      {/* -------------------- 右栏 (7 列)：诊断成果与算法透视台 -------------------- */}
      <div className="lg:col-span-7 space-y-4">
        {/* 状态 A: 正在诊断中 */}
        {diagnosing && (
          <PolishProgressStage
            diagnoseStatus={diagnoseStatus}
            progressPercent={progressPercent}
            elapsedSeconds={elapsedSeconds}
            estimatedSeconds={estimatedSeconds}
            currentStageIndex={currentStageIndex}
            onCancel={handleCancelDiagnosis}
          />
        )}

        {/* 状态 B: 本地即时 ATS 启发式算法评分看板 */}
        {atsScore && !diagnosing && (
          <AtsScoreDashboard atsScore={atsScore} />
        )}

        {/* 状态 C: 诊断成果报告与一键复制 */}
        {diagnoseResult?.polish_advice && !diagnosing && (
          <PolishAdviceCard
            polishAdvice={diagnoseResult.polish_advice}
            copied={copied}
            onCopy={handleCopyAdvice}
            chatMessages={polishChatMessages}
            followUpInput={followUpInput}
            onFollowUpInputChange={setFollowUpInput}
            onFollowUpSend={handleFollowUpSend}
            followUpPending={followUpPending}
          />
        )}

        {/* 状态 D: 初始算法与技能赋能透视大屏 */}
        {!diagnosing && !diagnoseResult && (
          <PolishShowcase
            onInsertSample={() => {
              setResumeText(
                "主导电商微服务用户中心开发，负责用户鉴权与积分系统。利用 Spring Boot 与 Redis 进行高并发缓存设计，优化慢 SQL 查询，保障大促期间系统平稳运行。"
              );
              setTargetRole("后端开发工程师");
            }}
          />
        )}
      </div>
    </div>
  );
}
