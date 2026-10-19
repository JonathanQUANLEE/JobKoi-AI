import { useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { readFileAsBase64 } from "../lib/resumeUtils";
import { useRunStore } from "../store";

/**
 * 简历上传业务链路（从 HeroStage 下沉）。
 *
 * 文件 → base64 → 存入本地简历资料库 → 解析文本 → 拼求职画像 prompt → 交给对话入口。
 * 上传状态条文案与隐藏文件输入 ref 也由本 hook 持有，组件只负责渲染。
 *
 * @param onSubmitPrompt 上传解析完成后，把拼好的画像 prompt 交给 AI 对话入口
 */
export function useResumeUpload(onSubmitPrompt: (text: string) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

  async function handleResumeUpload(file?: File | null) {
    if (!file) return;
    setIsUploadingResume(true);
    setUploadStatusText(`正在同步「${file.name}」到资料库...`);
    try {
      const b64 = await readFileAsBase64(file);
      await ipc.saveResumeFile(file.name, b64);
      // 自动设为当前默认投递简历并通知全局界面实时更新绑定卡片
      try {
        await ipc.setDefaultResume(file.name);
        window.dispatchEvent(new Event("jobhunter_resume_default_updated"));
      } catch {}

      useRunStore.getState().notify({
        type: "success",
        text: `已成功导入简历资料库并设为默认：${file.name}`,
        source: "资料档案",
      });

      setUploadStatusText(`正在解析简历「${file.name}」文本内容...`);
      let parsedText = "";
      try {
        const contentRes = await ipc.getResumeContent(file.name);
        parsedText = contentRes.text?.trim() || "";
      } catch {}

      const prompt = parsedText
        ? `【已同步导入简历: ${file.name}】\n提取简历主要信息:\n${parsedText.slice(0, 1200)}\n\n请根据以上简历内容，分析我的技术栈与求职意向，定制匹配的求职画像（目标岗位、城市、必须与偏好技能、排除方向）。`
        : `【已同步导入简历资料: ${file.name}】\n请为我规划专属的求职岗位偏好与技能画像。`;

      onSubmitPrompt(prompt);
    } catch (err) {
      useRunStore.getState().notify({
        type: "error",
        text: `简历同步导入失败: ${String(err)}`,
      });
    } finally {
      setIsUploadingResume(false);
      setUploadStatusText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return { fileInputRef, isUploadingResume, uploadStatusText, handleResumeUpload };
}
