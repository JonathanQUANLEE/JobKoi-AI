import { useEffect, useRef, useState, type FC, type MouseEvent } from "react";
import {
  type PetAction,
  PET_ACTION_ROWS,
  PET_FRAME_COUNT,
  PET_FRAME_WIDTH,
  PET_FRAME_HEIGHT,
} from "./types";

interface PetSpriteProps {
  action: PetAction;
  facing?: "left" | "right";
  tilt?: number; // degrees, for mouse tracking
  scale?: number;
  interactive?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

// 乌萨奇各动作专属帧率 (ms)，呈现经典魔性与灵动节奏
const ACTION_FRAME_DELAYS: Record<PetAction, number> = {
  idle: 130,
  walk_right: 95,
  walk_left: 95,
  running: 75,
  jump: 100,
  waving: 110,
  failed: 130,
  waiting: 140,
  roll: 70, // 乌萨奇标志性高速大风车甩手
};

export const PetSprite: FC<PetSpriteProps> = ({
  action,
  facing = "right",
  tilt = 0,
  scale = 0.38, // 192 * 0.38 ≈ 73px, 208 * 0.38 ≈ 79px
  interactive = true,
  onClick,
  onDoubleClick,
  onMouseDown,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  // 1. 预加载乌萨奇官方 Codex 雪碧图 (来自 OhMyChiikawa)
  useEffect(() => {
    const img = new Image();
    img.src = "/pets/usagi/spritesheet.webp";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      if (!img.src.includes("./pets/usagi/spritesheet.webp")) {
        img.src = "./pets/usagi/spritesheet.webp";
      }
    };
    return () => {
      imgRef.current = null;
    };
  }, []);

  // 2. 帧动画循环控制器
  useEffect(() => {
    setFrameIndex(0); // 动作切换时从第一帧重新开始
    const delay = ACTION_FRAME_DELAYS[action] || 120;

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % PET_FRAME_COUNT);
    }, delay);

    return () => clearInterval(timer);
  }, [action]);

  // 3. Canvas 精确像素级绘制（消除 Windows 高分屏亚像素毛刺与缝隙渗透）
  useEffect(() => {
    if (!imageLoaded || !imgRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PET_FRAME_WIDTH, PET_FRAME_HEIGHT);
    ctx.imageSmoothingEnabled = false; // 保持锐利像素风格

    const row = PET_ACTION_ROWS[action] ?? 0;
    const srcX = frameIndex * PET_FRAME_WIDTH;
    const srcY = row * PET_FRAME_HEIGHT;

    ctx.save();

    // 翻转朝向处理：walk_right (Row 1) 与 walk_left (Row 2) 在雪碧图中已预置方向，其余正面动作按需镜像
    if (facing === "left" && action !== "walk_left" && action !== "walk_right") {
      ctx.translate(PET_FRAME_WIDTH, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      imgRef.current,
      srcX,
      srcY,
      PET_FRAME_WIDTH,
      PET_FRAME_HEIGHT,
      0,
      0,
      PET_FRAME_WIDTH,
      PET_FRAME_HEIGHT
    );

    ctx.restore();
  }, [imageLoaded, action, frameIndex, facing]);

  const displayWidth = Math.round(PET_FRAME_WIDTH * scale);
  const displayHeight = Math.round(PET_FRAME_HEIGHT * scale);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      style={{
        width: displayWidth,
        height: displayHeight,
        transform: `rotate(${tilt}deg)`,
        transition: "transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
      className={`relative select-none ${
        interactive ? "cursor-grab active:cursor-grabbing hover:scale-105" : ""
      } ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={PET_FRAME_WIDTH}
        height={PET_FRAME_HEIGHT}
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: "pixelated",
        }}
        className="block drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
};

export default PetSprite;
