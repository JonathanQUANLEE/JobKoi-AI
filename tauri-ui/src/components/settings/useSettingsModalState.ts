import { useState, useEffect } from "react";
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
    savedSuccess,
    auditLogs,
    setAuditLogs,
    logSearchQuery,
    setLogSearchQuery,
    logTypeFilter,
    setLogTypeFilter,
    handleSaveAll,
  };
}

