import { Database, Trash2, Search, Bell } from "lucide-react";
import { auditDb, type AuditLogItem } from "../../../lib/auditDb";

interface NotificationsTabProps {
  auditLogs: AuditLogItem[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogItem[]>>;
  logSearchQuery: string;
  setLogSearchQuery: (v: string) => void;
  logTypeFilter: string;
  setLogTypeFilter: (v: string) => void;
  isMonochrome: boolean;
}

export default function NotificationsTab({
  auditLogs,
  setAuditLogs,
  logSearchQuery,
  setLogSearchQuery,
  logTypeFilter,
  setLogTypeFilter,
  isMonochrome,
}: NotificationsTabProps) {
  return (
    <div className="space-y-4 flex flex-col h-full">
      {/* 顶部：底层架构说明徽章与清空操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)]">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-emerald-400 shrink-0" />
          <div>
            <div className="font-semibold text-stone-200 text-xs flex items-center gap-1.5">
              <span>本地优先数据库</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                Rust / SQLite
              </span>
            </div>
            <div className="text-[10px] text-stone-500">
              所有修改记录和运行通知 100% 留存在您本机设备，零云端上传
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              auditDb.clear();
              setAuditLogs([]);
            }}
            disabled={auditLogs.length === 0}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-[var(--grid)] text-stone-400 hover:text-red-400 hover:border-red-500/30 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3" />
            <span>清空日志</span>
          </button>
        </div>
      </div>

      {/* 搜索与类型筛选工具条 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="size-3.5 absolute left-3 top-2.5 text-stone-500" />
          <input
            type="text"
            value={logSearchQuery}
            onChange={(e) => setLogSearchQuery(e.target.value)}
            placeholder="搜索通知关键词或来源模块..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] text-xs text-stone-200 placeholder-stone-600 focus:outline-none"
          />
        </div>

        <div className="flex gap-1 shrink-0 text-[10px]">
          {[
            { id: "all", label: "全部" },
            { id: "success", label: "成功" },
            { id: "error", label: "异常" },
            { id: "info", label: "信息" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLogTypeFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                logTypeFilter === tab.id
                  ? isMonochrome
                    ? "bg-white text-black font-bold border-white"
                    : "bg-amber-500 text-stone-950 font-bold border-amber-500"
                  : "border-[var(--grid)] bg-[var(--panel-2)] text-stone-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 记录列表展示 */}
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[300px] pr-1">
        {auditLogs
          .filter((log) => {
            if (logTypeFilter !== "all" && log.type !== logTypeFilter) return false;
            if (!logSearchQuery.trim()) return true;
            const q = logSearchQuery.toLowerCase();
            return (
              log.text.toLowerCase().includes(q) ||
              log.source.toLowerCase().includes(q) ||
              log.timeFormatted.includes(q)
            );
          })
          .map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] flex items-start justify-between gap-2.5 hover:border-white/20 transition-all text-xs"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span
                  className={`size-2 rounded-full mt-1.5 shrink-0 ${
                    log.type === "success"
                      ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
                      : log.type === "error"
                      ? "bg-red-400 shadow-[0_0_6px_#ef4444]"
                      : "bg-amber-400 shadow-[0_0_6px_#f59e0b]"
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-stone-200">{log.source}</span>
                    <span className="text-[10px] text-stone-500 font-mono">
                      {log.timeFormatted}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed break-words">
                    {log.text}
                  </p>
                </div>
              </div>
            </div>
          ))}

        {auditLogs.length === 0 && (
          <div className="py-12 text-center text-stone-500 text-xs">
            <Bell className="size-8 mx-auto mb-2 opacity-30" />
            <p>暂无本地操作审计与通知记录</p>
            <p className="text-[10px] text-stone-600 mt-1">
              所有资产入库、配置变更与巡航命中事件将自动持久化在此处
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
