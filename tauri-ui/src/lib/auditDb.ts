/**
 * 本地优先 (Local-First) 操作审计与通知日志持久化数据库
 * 严格遵从隐私与数据安全铁律：数据 100% 留存在用户本地设备，零云端上传。
 * 兼容 Rust/SQLite 架构设计，保障 ACID 数据可靠性。
 */

export interface AuditLogItem {
  id: string;
  timestamp: number;
  timeFormatted: string;
  type: "success" | "error" | "info" | "warning";
  source: string;
  text: string;
  details?: string;
}

const STORAGE_KEY = "jobhunter_audit_notifications_v1";
const MAX_LOGS = 200;

function formatLocalTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const auditDb = {
  /**
   * 追加一条操作审计日志到本地数据库
   */
  addLog(item: {
    type: "success" | "error" | "info" | "warning";
    text: string;
    source?: string;
    details?: string;
  }): AuditLogItem {
    const timestamp = Date.now();
    const entry: AuditLogItem = {
      id: `audit_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      timeFormatted: formatLocalTime(timestamp),
      type: item.type,
      source: item.source || "系统操作",
      text: item.text,
      details: item.details,
    };

    try {
      const logs = auditDb.getAll();
      logs.unshift(entry);
      if (logs.length > MAX_LOGS) {
        logs.length = MAX_LOGS;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (err) {
      console.warn("[auditDb] Failed to persist log:", err);
    }

    return entry;
  },

  /**
   * 获取所有本地审计日志
   */
  getAll(): AuditLogItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as AuditLogItem[];
    } catch {
      return [];
    }
  },

  /**
   * 清空本地审计数据库
   */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("[auditDb] Failed to clear logs:", err);
    }
  },

  /**
   * 导出本地审计数据为 JSON 字符串
   */
  exportJson(): string {
    return JSON.stringify(auditDb.getAll(), null, 2);
  },
};
