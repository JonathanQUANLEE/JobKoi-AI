import { useState, useEffect, useCallback } from "react";
import { ipc, type ResumeItem, type ResumeContentResult } from "../lib/ipc";
import { useT, useRunStore } from "../store";
import { createBlobUrl, readFileAsBase64 } from "../lib/resumeUtils";

export function useResumeVault() {
  const t = useT();
  const notify = useRunStore((s) => s.notify);

  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // 缓存所有文件的内容与 Blob URL，供 3D 书架抽屉堆叠卡片即时展示
  const [contentsCache, setContentsCache] = useState<Record<string, ResumeContentResult>>({});
  const [blobCache, setBlobCache] = useState<Record<string, string>>({});
  const [loadingCache, setLoadingCache] = useState<Record<string, boolean>>({});

  // 能量胶囊充盈进度条状态
  const [chargingProgress, setChargingProgress] = useState<number | null>(null);
  const [chargingStatus, setChargingStatus] = useState<string>("");

  // 加载简历列表
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await ipc.listResumes();
      setResumes(result.resumes);

      // 默认选中默认简历，或第一份简历
      setSelectedName((prev) => {
        if (prev && result.resumes.some((r) => r.name === prev)) {
          return prev;
        }
        const defaultItem = result.resumes.find((r) => r.is_default);
        return defaultItem ? defaultItem.name : result.resumes[0]?.name || null;
      });
    } catch (err) {
      notify({ type: "error", text: t("resume.loadFailed", { error: String(err) }), source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }, [t, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 预加载所有未缓存的文件内容与 Blob 流
  useEffect(() => {
    if (resumes.length === 0) return;

    resumes.forEach((item) => {
      if (contentsCache[item.name] || loadingCache[item.name]) return;

      setLoadingCache((prev) => ({ ...prev, [item.name]: true }));
      ipc
        .getResumeContent(item.name)
        .then((data) => {
          setContentsCache((prev) => ({ ...prev, [item.name]: data }));
          if (data.data_url) {
            const blobUrl = createBlobUrl(data.data_url, data.mime);
            setBlobCache((prev) => ({ ...prev, [item.name]: blobUrl }));
          }
        })
        .catch((err) => {
          console.warn(`加载资料内容 [${item.name}] 失败:`, err);
        })
        .finally(() => {
          setLoadingCache((prev) => ({ ...prev, [item.name]: false }));
        });
    });
  }, [resumes, contentsCache, loadingCache]);

  // 组件卸载时释放所有已生成的 Blob URL
  useEffect(() => {
    return () => {
      Object.values(blobCache).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, [blobCache]);

  // 设为默认简历
  const handleSetDefault = useCallback(async (name: string) => {
    setBusy(true);
    try {
      await ipc.setDefaultResume(name);
      await refresh();
      notify({ type: "success", text: t("resume.defaultSet", { name }), source: "资料档案" });
    } catch (err) {
      notify({ type: "error", text: t("resume.setFailed", { error: String(err) }), source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }, [refresh, notify, t]);

  // 一键系统原生软件直开（调起本地 WPS / Word / 系统照片查看器等）
  const handleOpenNative = useCallback(async (name: string) => {
    try {
      await ipc.openResumeNative(name);
      notify({ type: "info", text: `已调起系统原生软件打开「${name}」`, source: "资料档案" });
    } catch (err) {
      notify({ type: "error", text: `无法调起原版程序: ${String(err)}`, source: "资料档案" });
    }
  }, [notify]);

  // 物理销毁入库文件
  const handleDeleteConfirmed = useCallback(async (name: string) => {
    setBusy(true);
    try {
      await ipc.deleteResumeFile(name);
      notify({ type: "success", text: `已安全销毁并移出资料库: 「${name}」`, source: "资料档案" });
      setContentsCache((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      if (blobCache[name]) {
        URL.revokeObjectURL(blobCache[name]);
        setBlobCache((prev) => {
          const copy = { ...prev };
          delete copy[name];
          return copy;
        });
      }
      await refresh();
    } catch (err) {
      notify({ type: "error", text: `删除失败: ${String(err)}`, source: "资料档案" });
    } finally {
      setBusy(false);
    }
  }, [blobCache, refresh, notify]);

  // 触发能量胶囊充盈入库特效动画
  const triggerEnergyCharge = useCallback(async (task: () => Promise<void>) => {
    setChargingProgress(15);
    setChargingStatus("正在准备能量流，读取本地文件字节...");

    const t1 = setTimeout(() => {
      setChargingProgress(48);
      setChargingStatus("荧光能量汇聚中 · 正在解析文件多模态结构...");
    }, 200);

    const t2 = setTimeout(() => {
      setChargingProgress(88);
      setChargingStatus("能量充盈接近拉满 · 正在构建本地资产索引...");
    }, 450);

    try {
      await task();
      clearTimeout(t1);
      clearTimeout(t2);
      setChargingProgress(100);
      setChargingStatus("✨ 能量拉满 100% · 资料已成功入库并就绪！");

      setTimeout(() => {
        setChargingProgress(null);
        setChargingStatus("");
      }, 1400);
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setChargingProgress(null);
      throw err;
    }
  }, []);

  // 处理多文件上传
  const handleUploadFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setBusy(true);

    try {
      await triggerEnergyCharge(async () => {
        let lastUploadedName = "";
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const base64Data = await readFileAsBase64(file);
          await ipc.saveResumeFile(file.name, base64Data);
          lastUploadedName = file.name;
        }
        await refresh();
        if (lastUploadedName) {
          setSelectedName(lastUploadedName);
        }
      });
      notify({
        type: "success",
        text: `成功将 ${files.length} 份资料入库至本地资料库`,
        source: "资料档案",
      });
    } catch (err) {
      console.error("上传文件入库失败:", err);
      notify({
        type: "error",
        text: `上传入库失败: ${String(err)}`,
        source: "资料档案",
      });
    } finally {
      setBusy(false);
    }
  }, [triggerEnergyCharge, refresh, notify]);

  return {
    resumes,
    busy,
    selectedName,
    setSelectedName,
    contentsCache,
    blobCache,
    loadingCache,
    chargingProgress,
    chargingStatus,
    refresh,
    handleSetDefault,
    handleOpenNative,
    handleDeleteConfirmed,
    handleUploadFiles,
  };
}
