'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import './OptionWheel.css';

export interface OptionWheelItemData {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  [key: string]: unknown;
}

export type OptionWheelItem = string | OptionWheelItemData;

export interface OptionWheelProps<T extends OptionWheelItem = OptionWheelItem> {
  items?: T[];
  defaultSelected?: number;
  selected?: number;
  onChange?: (index: number, item: T) => void;
  textColor?: string;
  activeColor?: string;
  side?: 'left' | 'right';
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  className?: string;
  renderItem?: (item: T, index: number, isSelected: boolean) => React.ReactNode;
}

const DEFAULT_ITEMS: OptionWheelItem[] = [
  'Ambient',
  'House',
  'Techno',
  'Jazz',
  'Lo-Fi',
  'Synthwave',
  'Trance',
  'Funk',
  'Disco',
  'Hip-Hop',
  'Chillwave',
  'Drum & Bass'
];

export default function OptionWheel<T extends OptionWheelItem = OptionWheelItem>({
  items = DEFAULT_ITEMS as T[],
  defaultSelected = 0,
  selected,
  onChange,
  textColor = '#a8a29e',
  activeColor = '#ffffff',
  side = 'left',
  fontSize = 0.95,
  spacing = 2.4,
  curve = 1,
  tilt = 6,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  inset = 24,
  loop = false,
  draggable = true,
  soundUrl = '',
  soundVolume = 0.4,
  className = '',
  renderItem
}: OptionWheelProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const initialIndex = selected !== undefined ? selected : defaultSelected;
  const posRef = useRef<number>(initialIndex);
  const targetRef = useRef<number>(initialIndex);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const cfgRef = useRef<{
    count: number;
    items: T[];
    rowH: number;
    curve: number;
    tilt: number;
    blur: number;
    fade: number;
    minOpacity: number;
    side: 'left' | 'right';
    loop: boolean;
    smoothing: number;
    draggable: boolean;
    soundUrl: string;
    soundVolume: number;
  }>({
    count: items.length,
    items,
    rowH: 38,
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume
  });

  const onChangeRef = useRef(onChange);
  const selectedRef = useRef<number>(initialIndex);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');
  const lastTickRef = useRef<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialIndex);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const remPx = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  onChangeRef.current = onChange;
  cfgRef.current = {
    count: items.length,
    items,
    rowH: Math.max(fontSize * spacing * remPx, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume
  };

  // Single rAF loop that eases the wheel position toward its target with
  // frame-rate independent exponential smoothing, then lays every option out
  // along the curve based on its distance from the current position.
  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current;
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    const target = targetRef.current;
    const cur = posRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    posRef.current = next;

    const els = itemRefs.current;
    const n = cfg.count;
    const mirror = cfg.side === 'right' ? -1 : 1;
    // Options sit on a circle whose radius keeps the arc length between two
    // neighbors equal to one row height, so tilt controls how tightly it curls.
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const R = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
    for (let i = 0; i < n; i++) {
      const el = els[i];
      if (!el) continue;
      let d = i - next;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      const dist = Math.abs(d);
      let x = 0;
      let y = d * cfg.rowH;
      let rot = 0;
      if (R > 0) {
        const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
        y = R * Math.sin(ang);
        x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve;
        rot = (mirror * ang * 180) / Math.PI;
      }
      el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade));
      el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : 'none';
      el.style.setProperty('--ow-p', Math.max(0, 1 - Math.min(dist, 1)).toFixed(4));
    }

    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  // Optional tick on selection change, throttled so fast scrolling can't spam
  // it, and with playback failures silently ignored.
  const playTick = useCallback(() => {
    const { soundUrl: sound, soundVolume: vol } = cfgRef.current;
    if (!sound) return;
    const now = performance.now();
    if (now - lastTickRef.current < 60) return;
    lastTickRef.current = now;

    if (sound === 'synth') {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.02);
          gain.gain.setValueAtTime(vol * 0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.025);
          setTimeout(() => {
            ctx.close().catch(() => {});
          }, 80);
        }
      } catch {}
      return;
    }

    if (!audioRef.current || audioUrlRef.current !== sound) {
      audioRef.current = new Audio(sound);
      audioRef.current.preload = 'auto';
      audioUrlRef.current = sound;
    }
    const audio = audioRef.current;
    audio.volume = Math.min(Math.max(vol, 0), 1);
    audio.currentTime = 0;
    audio.play()?.catch(() => {});
  }, []);

  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const cfg = cfgRef.current;
      let v = value;
      if (!cfg.loop) v = Math.min(Math.max(v, 0), Math.max(cfg.count - 1, 0));
      if (snap) v = Math.round(v);
      targetRef.current = v;
      const idx = ((Math.round(v) % cfg.count) + cfg.count) % cfg.count;
      if (idx !== selectedRef.current) {
        selectedRef.current = idx;
        setSelectedIndex(idx);
        onChangeRef.current?.(idx, cfg.items[idx]);
        playTick();
      }
      startLoop();
    },
    [startLoop, playTick]
  );

  // Sync with outer `selected` prop
  useEffect(() => {
    if (selected !== undefined && selected !== selectedRef.current) {
      applyTarget(selected, true);
    }
  }, [selected, applyTarget]);

  // Wheel / touchpad scrolling, registered manually so it can be non-passive.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cfg = cfgRef.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      // Cap each event at one step so notchy mouse wheels move exactly one
      // option per click, while touchpads still scroll continuously.
      const step = Math.max(-1, Math.min(1, delta / cfg.rowH));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cfgRef.current.draggable) return;
    dragRef.current = { y: e.clientY, start: targetRef.current, id: e.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) {
        dragMovedRef.current = true;
        // Capture only once a real drag starts, so plain clicks still reach
        // the items and navigate to them.
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (dragMovedRef.current) applyTarget(drag.start - dy / cfgRef.current.rowH, false);
    },
    [applyTarget]
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) return;
      const cfg = cfgRef.current;
      const cur = targetRef.current;
      let d = index - (((cur % cfg.count) + cfg.count) % cfg.count);
      if (cfg.loop && cfg.count > 1) {
        if (d > cfg.count / 2) d -= cfg.count;
        else if (d < -cfg.count / 2) d += cfg.count;
      }
      applyTarget(cur + d, true);
    },
    [applyTarget]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let delta: number | null = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') delta = 1;
      if (delta == null) return;
      e.preventDefault();
      e.stopPropagation();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget]
  );

  useEffect(() => {
    applyTarget(targetRef.current, false);
  }, [items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.pause();
    },
    []
  );

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="Option wheel"
      className={`option-wheel${side === 'right' ? ' option-wheel--right' : ''}${isDragging ? ' option-wheel--dragging' : ''}${className ? ` ${className}` : ''}`}
      style={
        {
          '--ow-text-color': textColor,
          '--ow-active-color': activeColor,
          '--ow-font-size': `${fontSize}rem`,
          '--ow-inset': `${inset}px`
        } as React.CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const isSelected = selectedIndex === index;
        const isObj = typeof item === 'object' && item !== null;
        const itemObj = isObj ? (item as OptionWheelItemData) : null;
        const label = itemObj ? itemObj.label : String(item);
        const icon = itemObj?.icon;
        const badge = itemObj?.badge;
        const badgeColor = itemObj?.badgeColor;

        return (
          <div
            key={`${label}-${index}`}
            ref={el => {
              itemRefs.current[index] = el;
            }}
            role="option"
            aria-selected={isSelected}
            className={`option-wheel__item${isSelected ? ' option-wheel__item--selected' : ''}`}
            onClick={() => handleItemClick(index)}
          >
            {renderItem ? (
              renderItem(item, index, isSelected)
            ) : (
              <div className={`option-wheel__content ${isSelected ? 'option-wheel__content--selected' : ''}`}>
                {icon && <span className="option-wheel__icon">{icon}</span>}
                <span className="option-wheel__label">{label}</span>
                {badge && (
                  <span className={`option-wheel__badge ${badgeColor || 'bg-stone-800 text-stone-400'}`}>
                    {badge}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
