import { useEffect, useState, useMemo } from "react";
import {
  X,
  ExternalLink,
  RotateCcw,
  Search,
  Send,
  Building2,
  MapPin,
  DollarSign,
  Clock,
  Sparkles,
  Download,
} from "lucide-react";
import { ipc, type DeliveryRecordItem } from "../../lib/ipc";
import { useRunStore } from "../../store";

interface DeliveryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlatform?: string;
}

export default function DeliveryHistoryModal({
  isOpen,
  onClose,
  initialPlatform = "",
}: DeliveryHistoryModalProps) {
  const [platformFilter, setPlatformFilter] = useState<string>(initialPlatform);
  const [searchKw, setSearchKw] = useState<string>("");
  const [records, setRecords] = useState<DeliveryRecordItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  const notify = useRunStore((s) => s.notify);

  const loadData = async (targetPlatform: string = "") => {
    setLoading(true);
    try {
      const res = await ipc.getDeliveryHistory(targetPlatform, 120);
      if (res && res.records) {
        setRecords(res.records);
      }
    } catch (err) {
      notify({
        type: "error",
        text: `加载投递记录失败: ${String(err)}`,
        source: "投递档案",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setPlatformFilter(initialPlatform);
      loadData(initialPlatform);
    }
  }, [isOpen, initialPlatform]);

  const handlePlatformChange = (pId: string) => {
    setPlatformFilter(pId);
    loadData(pId);
  };

  const handleResetToday = async () => {
    const confirmMsg = "确定要安全归档今日投递计数吗？\n（这会将今日记录标记为已归档，重置今日限额计数，以便您立即启动继续测试）";
    if (!window.confirm(confirmMsg)) return;

    setResetting(true);
    try {
      const res = await ipc.resetTodayDelivery(platformFilter || "boss");
      notify({
        type: "success",
        text: `已成功归档并重置 ${res.archived_count} 条今日记录，已恢复完整投递额度！`,
        source: "投递配额",
        duration: 8000,
      });
      await loadData(platformFilter);
    } catch (err) {
      notify({
        type: "error",
        text: `重置失败: ${String(err)}`,
        source: "投递配额",
      });
    } finally {
      setResetting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!searchKw.trim()) return records;
    const kw = searchKw.trim().toLowerCase();
    return records.filter(
      (r) =>
        r.title.toLowerCase().includes(kw) ||
        r.company.toLowerCase().includes(kw) ||
        r.location.toLowerCase().includes(kw),
    );
  }, [records, searchKw]);

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const header = "时间,平台,岗位名称,企业公司,薪资,地点,状态,职位链接\n";
    const rows = filteredRecords
      .map(
        (r) =>
          `"${r.time}","${r.platform_name}","${r.title.replace(/"/g, '""')}","${r.company.replace(
            /"/g,
            '""',
          )}","${r.salary}","${r.location}","${r.status}","${r.url}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", `delivery_records_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#141210] border border-stone-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-stone-800 bg-stone-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Send className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <span>投递明细记录</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  共 {records.length} 条
                </span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                记录通过自动巡航打招呼沟通的岗位与企业，实时留存于本地
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToday}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-700 bg-stone-850 hover:bg-stone-800 hover:border-amber-500/40 text-stone-300 hover:text-amber-300 text-xs font-medium cursor-pointer transition-all"
              title="归档今日计数，重置今日限额，方便继续测试"
            >
              <RotateCcw className={`size-3.5 ${resetting ? "animate-spin" : ""}`} />
              <span>重置今日计数 (测试)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* 筛选与操作栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-stone-850 bg-stone-950/40 shrink-0">
          {/* 平台 Tab 切换 */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-900/80 border border-stone-800 text-xs">
            {[
              { id: "", label: "全部平台" },
              { id: "boss", label: "BOSS 直聘" },
              { id: "liepin", label: "猎聘" },
              { id: "job51", label: "前程无忧" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handlePlatformChange(tab.id)}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  platformFilter === tab.id
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 搜索与导出 */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-stone-500" />
              <input
                type="text"
                placeholder="搜索岗位或公司..."
                value={searchKw}
                onChange={(e) => setSearchKw(e.target.value)}
                className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-xl bg-stone-900 border border-stone-800 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-800 bg-stone-900 hover:bg-stone-850 text-stone-300 text-xs cursor-pointer transition-all"
              title="导出当前列表为 CSV 文件"
            >
              <Download className="size-3.5 text-stone-400" />
              <span>导出</span>
            </button>
          </div>
        </div>

        {/* 投递列表正文区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500 space-y-2">
              <RotateCcw className="size-6 animate-spin text-amber-500" />
              <p className="text-xs">正在读取本地投递历史档案...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Sparkles className="size-10 text-stone-600 mb-2.5" />
              <p className="text-sm font-semibold text-stone-300">暂无匹配的投递记录</p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                点击工作台左侧「启动自动巡航」，系统会自动匹配岗位并在此记录每一笔打招呼沟通明细。
              </p>
            </div>
          ) : (
            filteredRecords.map((item, idx) => (
              <div
                key={`${item.platform}_${item.time}_${idx}`}
                className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-stone-900/40 border border-stone-850 hover:border-amber-500/30 hover:bg-stone-900/70 transition-all text-xs"
              >
                {/* 左侧：岗位与平台 */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        item.platform === "boss"
                          ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                          : item.platform === "liepin"
                          ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {item.platform_name}
                    </span>
                    <h4 className="font-bold text-sm text-stone-100 truncate">
                      {item.title}
                    </h4>
                    {item.salary && (
                      <span className="font-mono text-amber-400 font-semibold text-xs shrink-0 flex items-center gap-0.5">
                        <DollarSign className="size-3" />
                        {item.salary}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-stone-400 text-[11px]">
                    <span className="flex items-center gap-1 font-medium text-stone-300">
                      <Building2 className="size-3 text-stone-500" />
                      {item.company}
                    </span>
                    {item.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3 text-stone-500" />
                        {item.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-stone-500">
                      <Clock className="size-3 text-stone-500" />
                      {item.time}
                    </span>
                  </div>
                </div>

                {/* 右侧：状态与外链 */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                    ● {item.status || "已沟通"}
                  </span>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-xl border border-stone-800 hover:border-amber-500/40 hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
                      title="在浏览器中查看岗位原帖"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
