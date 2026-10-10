/**
 * 乌萨奇 (Usagi) 专属声音引擎
 * 支持真实音频文件播放 (如果存在 /sounds/usagi/ 下)；
 * 若未下载或离线，自动无缝回退至 Web Audio 原生合成的萌系音效。
 */

type UsagiSound = "yaha" | "ura" | "pululu" | "haa" | "jump" | "celebrate";

class UsagiSoundManager {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.5;

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
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

    // 优先尝试播放真实音频文件 (如用户放置的 mp3)
    const audioPath = `/sounds/usagi/${type}.mp3`;
    const audio = new Audio(audioPath);
    audio.volume = this.volume;
    
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // 如果没有找到 mp3，则使用 Web Audio 原生波形合成可爱音效
        this.playSynthetic(type);
      });
    } else {
      this.playSynthetic(type);
    }
  }

  /**
   * Web Audio 原生音效合成器 (零外部依赖，100% 离线可用且不会报错)
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

      if (type === "yaha") {
        // 「ヤハ！」：轻快上扬双音阶
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
      } else if (type === "ura") {
        // 「ウラ！」：有力短促萌音
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
      } else if (type === "pululu") {
        // 「ルルルルル！」：快速魔性甩手颤音 (Usagi Roll 特效)
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
      } else if (type === "jump") {
        // 跳跃卡通弹簧音
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
      } else if (type === "haa") {
        // 「ハァ？」：疑惑微降音
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
      } else if (type === "celebrate") {
        // 庆祝连续音阶 (Ura Yaha~)
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
