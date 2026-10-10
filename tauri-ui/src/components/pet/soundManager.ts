/**
 * 乌萨奇 (Usagi) 专属声音引擎
 * 纯正自媒体短视频爆款 AI 乌萨奇中文拟音声效体系 (10 大场景全覆盖)
 * 彻底移除日文原声与日语配置，支持全套离线高质音频播放
 */

export type UsagiSound =
  | "hi"                 // 单击互动 -> zh_click.mp3
  | "yaha"               // 单击互动 -> zh_click.mp3
  | "click"              // 单击互动 -> zh_click.mp3
  | "grabbed"            // 鼠标按住悬空抓起 -> zh_grabbed.mp3 ("放我下来！")
  | "ura"                // 映射到 grabbed
  | "spawn"              // 松手停靠/落地 -> zh_dock.mp3 ("打工！打工！")
  | "dock"               // 映射到 spawn
  | "jump"               // 映射到 spawn
  | "pululu"             // 双击狂欢大风车 -> zh_windmill.mp3 ("大风车转转转！")
  | "danceswirl"         // 映射到 pululu
  | "windmill"           // 映射到 pululu
  | "signboard_ask"      // 弹出定时木牌 -> zh_signboard_ask.mp3 ("你要开启定时巡航吗？")
  | "signboard_confirm"  // 确认设定时间 -> zh_signboard_confirm.mp3 ("滑动滚轮设定时间！")
  | "signboard_cancel"   // 取消收起木牌 -> zh_signboard_cancel.mp3 ("拔草去咯！")
  | "dance"              // 巡航打招呼启动 -> zh_cruise_start.mp3 ("全速冲刺！")
  | "celebrate"          // 映射到 dance
  | "cruise"             // 映射到 dance
  | "reset_sidebar"      // 点击归位回侧边栏 -> zh_reset_sidebar.mp3 ("回工位打卡！")
  | "mock";              // 闲逛发呆/戳一戳 -> zh_mock.mp3 ("看什么看！还不快去刷Boss！")

const SOUND_FILE_MAP: Record<UsagiSound, string> = {
  hi: "/sounds/usagi/zh_click.mp3",
  yaha: "/sounds/usagi/zh_click.mp3",
  click: "/sounds/usagi/zh_click.mp3",
  grabbed: "/sounds/usagi/zh_grabbed.mp3",
  ura: "/sounds/usagi/zh_grabbed.mp3",
  spawn: "/sounds/usagi/zh_dock.mp3",
  dock: "/sounds/usagi/zh_dock.mp3",
  jump: "/sounds/usagi/zh_dock.mp3",
  pululu: "/sounds/usagi/zh_windmill.mp3",
  danceswirl: "/sounds/usagi/zh_windmill.mp3",
  windmill: "/sounds/usagi/zh_windmill.mp3",
  signboard_ask: "/sounds/usagi/zh_signboard_ask.mp3",
  signboard_confirm: "/sounds/usagi/zh_signboard_confirm.mp3",
  signboard_cancel: "/sounds/usagi/zh_signboard_cancel.mp3",
  dance: "/sounds/usagi/zh_cruise_start.mp3",
  celebrate: "/sounds/usagi/zh_cruise_start.mp3",
  cruise: "/sounds/usagi/zh_cruise_start.mp3",
  reset_sidebar: "/sounds/usagi/zh_reset_sidebar.mp3",
  mock: "/sounds/usagi/zh_mock.mp3",
};

class UsagiSoundManager {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.65;
  private currentAudio: HTMLAudioElement | null = null;

  constructor() {
    try {
      const savedMute = localStorage.getItem("jobhunter_usagi_sound_enabled");
      if (savedMute !== null) {
        this.soundEnabled = savedMute === "true";
      }
      const savedVol = localStorage.getItem("jobhunter_usagi_volume");
      if (savedVol !== null) {
        this.volume = parseFloat(savedVol);
      }
    } catch {}
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem("jobhunter_usagi_sound_enabled", String(enabled));
    } catch {}
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem("jobhunter_usagi_volume", String(this.volume));
    } catch {}
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * 播放短视频爆款 AI 乌萨奇中文拟音声效
   */
  public play(type: UsagiSound) {
    if (!this.soundEnabled || this.volume <= 0) return;

    const targetPath = SOUND_FILE_MAP[type] || "/sounds/usagi/zh_click.mp3";

    try {
      // 停止上一段播放，避免杂音堆叠
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      }

      const audio = new Audio(targetPath);
      audio.volume = this.volume;
      this.currentAudio = audio;

      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          this.playSynthetic(type);
        });
      }
    } catch {
      this.playSynthetic(type);
    }
  }

  /**
   * 综合发声入口：直接调用短视频 AI 拟音声效
   */
  public speak(soundType: UsagiSound) {
    if (!this.soundEnabled || this.volume <= 0) return;
    this.play(soundType);
  }

  public stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
  }

  /**
   * Web Audio 原生音效兜底合成器 (当音频路径受限时保障有声音)
   */
  private playSynthetic(type: UsagiSound) {
    try {
      this.initContext();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 0.4, now);
      masterGain.connect(ctx.destination);

      if (type === "hi" || type === "yaha" || type === "click" || type === "signboard_ask") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.15);
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "ura" || type === "grabbed") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(820, now + 0.15);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "pululu" || type === "danceswirl" || type === "windmill") {
        for (let i = 0; i < 6; i++) {
          const t = now + i * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(750 + (i % 2) * 150, t);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.06);
        }
      } else if (type === "spawn" || type === "dock" || type === "jump" || type === "signboard_confirm") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "mock" || type === "signboard_cancel") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.18);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const t = now + idx * 0.09;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.6, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.14);
        });
      }
    } catch {}
  }
}

export const usagiSound = new UsagiSoundManager();
