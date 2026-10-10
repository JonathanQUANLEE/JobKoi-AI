import type { ResumeItem, ResumeContentResult } from "./ipc";

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

export function isImageFile(name: string): boolean {
  const ext = getFileExtension(name);
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}

/**
 * 绘制高保真 A4 拟真公文纸张质感画布
 * 使任何 Word / PDF / TXT / 图片都能化身为可 3D 揉皱团碎的逼真实体纸张
 */
export function createDocumentTexture(
  item: ResumeItem,
  content?: ResumeContentResult,
  imageSrc?: string
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 960;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }

      const ext = getFileExtension(item.name);
      const isImg = isImageFile(item.name);

      // 1. 底层米黄色道林纸质感底色
      ctx.fillStyle = "#faf7f2";
      ctx.fillRect(0, 0, 720, 960);

      // 纸张微细浅格纹
      ctx.strokeStyle = "rgba(0, 0, 0, 0.025)";
      ctx.lineWidth = 1;
      for (let y = 48; y < 960; y += 36) {
        ctx.beginPath();
        ctx.moveTo(48, y);
        ctx.lineTo(672, y);
        ctx.stroke();
      }

      // 纸张边缘装订线与安全框
      ctx.strokeStyle = "#e3dacd";
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, 648, 888);

      // 顶部安全公文条
      ctx.fillStyle = "#1e1b18";
      ctx.fillRect(52, 52, 616, 52);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("RESUME ARCHIVE // 简历与能力资料库", 72, 84);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 13px monospace";
      ctx.fillText(ext ? ext.toUpperCase() : "DOC", 610, 84);

      // 文档大标题
      ctx.fillStyle = "#1c1917";
      ctx.font = "bold 24px sans-serif";
      const displayName =
        item.name.length > 26 ? item.name.slice(0, 24) + "..." : item.name;
      ctx.fillText(displayName, 64, 146);

      // 文档元信息
      ctx.fillStyle = "#78716c";
      ctx.font = "14px sans-serif";
      const sizeKb = (item.size / 1024).toFixed(1);
      ctx.fillText(
        `规格: ${sizeKb} KB   |   入库记录: ${item.mtime || "2026-10"}   |   密级: 核心资产`,
        64,
        176
      );

      // 装饰分隔红线
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, 192);
      ctx.lineTo(656, 192);
      ctx.stroke();

      // 如果是纯图片且有原图
      if (isImg && imageSrc) {
        const img = new Image();
        // 关键安全修复：本地 blob: 或 data: URI 绝不能设置 crossOrigin = anonymous，否则 Chromium 会拦截并污染 canvas
        if (imageSrc.startsWith("http://") || imageSrc.startsWith("https://")) {
          if (!imageSrc.includes("localhost") && !imageSrc.includes("127.0.0.1")) {
            img.crossOrigin = "anonymous";
          }
        }
        img.onload = () => {
          try {
            const drawW = 592;
            const drawH = 560;
            const imgAspect = (img.width / img.height) || 1;
            let w = drawW;
            let h = drawW / imgAspect;
            if (h > drawH) {
              h = drawH;
              w = drawH * imgAspect;
            }
            const x = 64 + (drawW - w) / 2;
            const y = 210 + (drawH - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            drawStampAndWatermark(ctx);
            resolve(canvas.toDataURL("image/png"));
          } catch (err) {
            console.warn("Canvas export fallback:", err);
            drawFallbackText(ctx, content, item);
            drawStampAndWatermark(ctx);
            try {
              resolve(canvas.toDataURL("image/png"));
            } catch {
              resolve("");
            }
          }
        };
        img.onerror = () => {
          drawFallbackText(ctx, content, item);
          drawStampAndWatermark(ctx);
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch {
            resolve("");
          }
        };
        img.src = imageSrc;
        return;
      }

      // 非图片（PDF、DOCX、TXT），提取真实文字渲染版面
      drawFallbackText(ctx, content, item);
      drawStampAndWatermark(ctx);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve("");
      }
    } catch (e) {
      console.error("createDocumentTexture unexpected error:", e);
      resolve("");
    }
  });
}

function drawFallbackText(
  ctx: CanvasRenderingContext2D,
  content: ResumeContentResult | undefined,
  item: ResumeItem
) {
  ctx.fillStyle = "#292524";
  ctx.font = "15px sans-serif";

  const ext = getFileExtension(item.name);

  let lines: string[] = [];
  if (content?.text && content.text.trim().length > 0) {
    lines = content.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 18);
  }

  if (lines.length === 0) {
    lines = [
      "【档案性质】 本地智能求职资料入库归档",
      "【安全说明】 包含用户个人简历、技能评定及求职偏好",
      "【入库状态】 数字指纹已绑定，可执行物理碎纸机擦除",
      "--------------------------------------------------",
      "该文档在系统运行中可作为投递与智能匹配的依据凭证。",
      "执行销毁后，所有本地文件映射及解析缓存将被永久抹除。",
      "--------------------------------------------------",
      "• 档案名称: " + item.name,
      "• 文件类型: " + (ext ? ext.toUpperCase() : "DOC"),
      "• 默认优先: " + (item.is_default ? "是 (默认投递件)" : "否"),
      "• 擦除模式: 3D 物理撕裂与纸球碎纸机回收",
    ];
  }

  let currY = 230;
  for (const line of lines) {
    if (currY > 780) break;
    if (line.startsWith("【") || line.startsWith("#")) {
      ctx.fillStyle = "#0f766e";
      ctx.font = "bold 15px sans-serif";
    } else {
      ctx.fillStyle = "#44403c";
      ctx.font = "14px sans-serif";
    }
    const truncated = line.length > 40 ? line.slice(0, 38) + "..." : line;
    ctx.fillText(truncated, 64, currY);
    currY += 28;
  }
}

function drawStampAndWatermark(ctx: CanvasRenderingContext2D) {
  // 红色官方公章印鉴
  ctx.save();
  ctx.translate(550, 780);
  ctx.rotate(-0.08);
  ctx.strokeStyle = "rgba(220, 38, 38, 0.78)";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(220, 38, 38, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("求职资产库", 0, -10);
  ctx.fillText("★ 档案归档章 ★", 0, 10);
  ctx.font = "10px sans-serif";
  ctx.fillText("VERIFIED ARCHIVE", 0, 26);
  ctx.restore();

  // 底部防伪编码水印
  ctx.fillStyle = "#a8a29e";
  ctx.font = "12px monospace";
  ctx.fillText("CONFIDENTIAL ASSET // CRUMPLE TO DESTROY // SYSTEM BOT", 64, 896);
}
