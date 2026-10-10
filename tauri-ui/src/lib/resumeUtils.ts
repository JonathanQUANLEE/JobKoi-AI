/**
 * 简历与附件文件辅助工具函数
 */

// 读取本地 File 转为 Base64
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}

// 创建本地二进制安全的 Blob URL
export function createBlobUrl(dataUrl: string, mime: string): string {
  try {
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    let cleanB64 = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    while (cleanB64.length % 4) cleanB64 += "=";
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("Blob conversion failed, fallback to data url:", err);
    return dataUrl;
  }
}

// 格式化文件字节大小
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 获取文件后缀名
export function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

// 判断是否为图片类型文件
export function isImageExt(name: string): boolean {
  const ext = getExtension(name);
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}
