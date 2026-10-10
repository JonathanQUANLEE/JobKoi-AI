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
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

// 不同动作专属帧间隔 (ms)，营造逼真节奏
const ACTION_FRAME_DELAYS: Record<PetAction, number> = {
  idle: 130,
  walk: 110,
  run: 90,
  sit: 160,
  sleep: 220,
  drag: 120,
  land: 100,
  celebrate: 100,
  waving: 120,
};

export const PetSprite: FC<PetSpriteProps> = ({
  action,
  facing = "right",
  tilt = 0,
  scale = 0.46, // 192 * 0.46 ≈ 88px, 208 * 0.46 ≈ 95px
  interactive = true,
  onClick,
  onMouseDown,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  // 1. 预加载雪碧图
  useEffect(() => {
    const img = new Image();
    img.src = "/pets/tater/spritesheet.webp";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
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

    // 翻转朝向处理
    if (facing === "left") {
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
