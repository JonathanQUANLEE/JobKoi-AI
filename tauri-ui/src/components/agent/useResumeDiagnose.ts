import { useState, useEffect, useRef, useCallback } from "react";
import { ipc, type ATSScoreData, type ResumeDiagnoseResult } from "../../lib/ipc";
import { fileKey, type QueuedFile } from "../core/HaloDropzone";
import { useRunStore } from "../../store";

export function useResumeDiagnose(getCurrentForm?: () => Record<string, unknown>) {
  const pendingResumePolish = useRunStore((s) => s.pendingResumePolish);
  const setPendingResumePolish = useRunStore((s) => s.setPendingResumePolish);

  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("后端开发工程师");
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeSkills, setActiveSkills] = useState<string[]>(["star", "xyz", "ats", "verbs"]);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [atsScore, setAtsScore] = useState<ATSScoreData | null>(null);

  // HaloDropzone 上传队列
  const [uploadQueue, setUploadQueue] = useState<QueuedFile[]>([]);
  const [showHaloUpload, setShowHaloUpload] = useState(false);

  // 诊断进度与状态
  const [diagnosing, setDiagnosing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(14);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [diagnoseStatus, setDiagnoseStatus] = useState<"working" | "done" | "error">("working");
  const [diagnoseResult, setDiagnoseResult] = useState<ResumeDiagnoseResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 多轮微调对话
  const [polishChatMessages, setPolishChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpPending, setFollowUpPending] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  // 1. 响应简历库跳转
  useEffect(() => {
    if (pendingResumePolish) {
      setLoadedFileName(pendingResumePolish.name);
      if (pendingResumePolish.text) {
        setResumeText(pendingResumePolish.text);
        ipc
          .calculateATSScore(pendingResumePolish.text)
          .then((score) => setAtsScore(score))
          .catch(() => {});
      }
      setPendingResumePolish(null);
    }
  }, [pendingResumePolish, setPendingResumePolish]);

  // 2. 本地即时计算 ATS 算法分
  useEffect(() => {
    if (!resumeText.trim()) {
      setAtsScore(null);
      return;
    }
    const timer = setTimeout(() => {
      ipc
        .calculateATSScore(resumeText)
        .then((res) => setAtsScore(res))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [resumeText]);

  // 3. 诊断心跳倒计时
  useEffect(() => {
    if (!diagnosing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setProgressPercent(12);
    setElapsedSeconds(0);
    setEstimatedSeconds(14);
    setCurrentStageIndex(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);

      if (elapsed <= 1) {
        setCurrentStageIndex(0);
        setProgressPercent(28);
        setEstimatedSeconds(Math.max(1, 14 - elapsed));
      } else if (elapsed <= 3) {
        setCurrentStageIndex(1);
        setProgressPercent(52);
        setEstimatedSeconds(Math.max(1, 14 - elapsed));
      } else if (elapsed <= 10) {
        setCurrentStageIndex(2);
        setProgressPercent(Math.min(88, 52 + (elapsed - 3) * 5));
        setEstimatedSeconds(Math.max(1, 15 - elapsed));
      } else {
        setCurrentStageIndex(3);
        setProgressPercent(Math.min(96, 88 + (elapsed - 10) * 0.8));
        setEstimatedSeconds(1);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [diagnosing]);

  // 切换 Skill 开关
  const toggleSkill = (id: string) => {
    setActiveSkills((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 处理 Halo 文件拖拽上传
  const handleHaloFiles = useCallback((files: File[]) => {
    const stamp = Date.now();
    const newItems: QueuedFile[] = files.map((file, i) => ({
      id: `${fileKey(file)}-${stamp}-${i}`,
      file,
      progress: 20,
      done: false,
    }));
    setUploadQueue(newItems);

    const targetFile = files[0];
    if (!targetFile) return;

    setLoadedFileName(targetFile.name);

    let p = 25;
    const interval = setInterval(() => {
      p += 25;
      if (p >= 100) {
        clearInterval(interval);
        setUploadQueue((prev) =>
          prev.map((row) => ({ ...row, progress: 100, done: true }))
        );

        if (targetFile.name.endsWith(".txt")) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            setResumeText(String(evt.target?.result || ""));
          };
          reader.readAsText(targetFile);
        } else {
          setResumeText((prev) =>
            prev
              ? `${prev}\n\n[已载入附件：${targetFile.name}（${(targetFile.size / 1024).toFixed(1)} KB）]`
              : `[已载入附件：${targetFile.name}（${(targetFile.size / 1024).toFixed(1)} KB）]\n请在此粘贴对应正文内容或重点经历段落以获取深度诊断。`
          );
        }
        setShowHaloUpload(false);
      } else {
        setUploadQueue((prev) =>
          prev.map((row) => ({ ...row, progress: p }))
        );
      }
    }, 120);
  }, []);

  const handleRemoveQueuedFile = useCallback((id: string) => {
    setUploadQueue((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // 启动核心诊断
  const handleRunDiagnosis = async () => {
    const textToDiagnose = resumeText.trim();
    if (!textToDiagnose) {
      setStatusMessage("请先在左侧输入或粘贴需要诊断精修的简历内容");
      return;
    }

    abortControllerRef.current = false;
    setDiagnosing(true);
    setDiagnoseStatus("working");
    setStatusMessage(null);

    try {
      const res = await ipc.diagnoseResume(
        textToDiagnose,
        targetRole,
        activeSkills,
        customPrompt
      );

      if (abortControllerRef.current) return;

      if (res.status === "ok") {
        setProgressPercent(100);
        setCurrentStageIndex(3);
        setDiagnoseStatus("done");
        setDiagnoseResult(res);
        if (res.ats_score) setAtsScore(res.ats_score);
        if (res.polish_advice) {
          setPolishChatMessages([{ role: "assistant", content: res.polish_advice }]);
        }
      } else {
        setDiagnoseStatus("error");
        setStatusMessage(res.message || "诊断服务请求异常，请检查网络或 API 配置");
      }
    } catch (err) {
      if (!abortControllerRef.current) {
        setDiagnoseStatus("error");
        setStatusMessage(String(err));
      }
    } finally {
      setTimeout(() => {
        setDiagnosing(false);
      }, 700);
    }
  };

  const handleCancelDiagnosis = () => {
    abortControllerRef.current = true;
    setDiagnosing(false);
    setStatusMessage("已中止本次诊断");
  };

  const handleCopyAdvice = () => {
    const textToCopy = diagnoseResult?.polish_advice || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFollowUpSend = async () => {
    const trimmed = followUpInput.trim();
    if (!trimmed || followUpPending) return;

    setPolishChatMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setFollowUpInput("");
    setFollowUpPending(true);

    try {
      const context = `用户简历段落：\n${resumeText.slice(0, 1000)}\n\n目标岗位：${targetRole}\n用户针对精修提出了新要求：\n${trimmed}\n\n请以顶级技术面试官身份，应用 STAR 与 Google X-Y-Z 法则，精炼输出 1~2 段可直接复制的完美改写。`;
      const res = await ipc.agentChat(context, [], getCurrentForm ? getCurrentForm() : {});
      if (res.status === "ok" && res.reply) {
        setPolishChatMessages((prev) => [...prev, { role: "assistant", content: res.reply || "" }]);
      } else {
        setPolishChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `微调处理异常：${res.message || "未知错误"}` },
        ]);
      }
    } catch (err) {
      setPolishChatMessages((prev) => [...prev, { role: "assistant", content: `请求失败：${String(err)}` }]);
    } finally {
      setFollowUpPending(false);
    }
  };

  return {
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
    setStatusMessage,
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
  };
}
