import { useState, useEffect } from "react";
import { ipc, type LLMConfig, type LLMPreset } from "../../lib/ipc";
import { auditDb, type AuditLogItem } from "../../lib/auditDb";
import type { SettingsTab } from "../SettingsModal";

interface UseSettingsModalStateProps {
  isOpen: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSaveConfig: () => Promise<boolean>;
}

export function useSettingsModalState({
  isOpen,
  initialTab = "general",
  onClose,
  onSaveConfig,
}: UseSettingsModalStateProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // General settings
  const [notifyOnMatch, setNotifyOnMatch] = useState(true);

  // Model settings
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("deepseek");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("https://api.deepseek.com");
  const [modelInput, setModelInput] = useState("deepseek-chat");
  const [modelStatusMsg, setModelStatusMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // 本地操作审计日志状态
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState<string>("all");

  useEffect(() => {
    if (isOpen || activeTab === "notifications") {
      setAuditLogs(auditDb.getAll());
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Load LLM Config
  useEffect(() => {
    if (isOpen) {
      ipc
        .getLLMConfig()
        .then((cfg) => {
          setLlmConfig(cfg);
          if (cfg.base_url) setBaseUrlInput(cfg.base_url);
          if (cfg.model) setModelInput(cfg.model);
          if (cfg.configured && cfg.api_key) setApiKeyInput(cfg.api_key);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectPreset = (p: LLMPreset) => {
    setSelectedPreset(p.id);
    setBaseUrlInput(p.base_url);
    setModelInput(p.default_model);
  };

  const handleSaveModel = async () => {
    setModelStatusMsg(null);
    try {
      const res = await ipc.saveLLMConfig(
        baseUrlInput.trim(),
        apiKeyInput.trim(),
        modelInput.trim(),
      );
      // 后端成功返回 status="saved"（出错抛异常走 catch）；老代码只认 "ok"，
      // 成功时反而弹出"保存提示: saved"误导用户（2026-10-14 修复，双兼容）。
      if (res.status === "saved" || res.status === "ok") {
        setModelStatusMsg("AI 模型配置已成功保存！");
        setTimeout(() => setModelStatusMsg(null), 3000);
      } else {
        setModelStatusMsg(`保存失败: ${res.status}`);
      }
    } catch (err) {
      setModelStatusMsg(`保存失败: ${String(err)}`);
    }
  };

  const handleSaveAll = async () => {
    await onSaveConfig();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return {
    activeTab,
    setActiveTab,
    notifyOnMatch,
    setNotifyOnMatch,
    llmConfig,
    selectedPreset,
    apiKeyInput,
    setApiKeyInput,
    baseUrlInput,
    setBaseUrlInput,
    modelInput,
    setModelInput,
    modelStatusMsg,
    savedSuccess,
    auditLogs,
    setAuditLogs,
    logSearchQuery,
    setLogSearchQuery,
    logTypeFilter,
    setLogTypeFilter,
    handleSelectPreset,
    handleSaveModel,
    handleSaveAll,
  };
}
