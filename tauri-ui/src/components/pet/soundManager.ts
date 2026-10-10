/**
 * 乌萨奇 (Usagi) 专属声音引擎
 * 集成真实动漫/游戏原声音频库 (10 大高质音频切片)
 * 若音频离线或异常，自动平滑降级至 Web Audio 原生音效合成
 */

export type UsagiSound =
  | "hi"         // "呀哈！"
  | "yaha"       // 映射到 hi.wav
  | "ura"        // 抓起挣扎 / 乌拉
  | "pululu"     // danceswirl.wav 甩手大风车
  | "danceswirl" // danceswirl.wav
  | "dance"      // dance.wav 庆祝/巡航进行曲
  | "celebrate"  // 映射到 dance.wav
  | "grabbed"    // 随机播放 grabbed1 / grabbed2 / grabbed3.wav
  | "mock"       // mock.wav "哈？"
  | "spawn"      // spawn.wav 落地回弹
  | "jump";      // 映射到 spawn.wav

const SOUND_FILE_MAP: Record<UsagiSound, string | string[]> = {
  hi: "/sounds/usagi/hi.wav",
  yaha: "/sounds/usagi/hi.wav",
  ura: ["/sounds/usagi/grabbed1.wav", "/sounds/usagi/grabbed2.wav", "/sounds/usagi/grabbed3.wav"],
  pululu: "/sounds/usagi/danceswirl.wav",
  danceswirl: "/sounds/usagi/danceswirl.wav",
  dance: "/sounds/usagi/dance.wav",
  celebrate: "/sounds/usagi/dance.wav",
  grabbed: ["/sounds/usagi/grabbed1.wav", "/sounds/usagi/grabbed2.wav", "/sounds/usagi/grabbed3.wav"],
  mock: "/sounds/usagi/mock.wav",
  spawn: "/sounds/usagi/spawn.wav",
  jump: "/sounds/usagi/spawn.wav",
};

class UsagiSoundManager {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.55;
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

  public play(type: UsagiSound) {
    if (!this.soundEnabled || this.volume <= 0) return;

    // 获取对应的真实音频路径
    const mapping = SOUND_FILE_MAP[type];
    let targetPath = "/sounds/usagi/hi.wav";
    if (Array.isArray(mapping)) {
      targetPath = mapping[Math.floor(Math.random() * mapping.length)];
    } else if (typeof mapping === "string") {
      targetPath = mapping;
    }

    try {
      const audio = new Audio(targetPath);
      audio.volume = this.volume;
      this.currentAudio = audio;

      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          // 备用：如遇本地静态路径拦截，自动使用 Web Audio 原生合成
          this.playSynthetic(type);
        });
      }
    } catch {
      this.playSynthetic(type);
    }
  }

  /**
   * 停止当前播放（如巡航或长音效中断时）
   */
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
   * Web Audio 原生音效合成器 (100% 离线兜底无依赖保障)
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

      if (type === "hi" || type === "yaha") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.15);
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
        osc.frequency.setValueAtTime(460, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === "pululu" || type === "danceswirl") {
        for (let i = 0; i < 7; i++) {
          const t = now + i * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(700 + (i % 2) * 120, t);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.06);
        }
      } else if (type === "spawn" || type === "jump") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "mock") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.18);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "dance" || type === "celebrate") {
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
