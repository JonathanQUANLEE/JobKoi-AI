/**
 * 乌萨奇 (Usagi) 专属声音引擎
 * 集成真实动漫原声音频库 + 中文版萌系自媒体/中配语音生成器
 * 支持中/日双语音模式切换 (Voice Mode: zh / ja)
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

export type UsagiVoiceMode = "zh" | "ja";

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
  private voiceMode: UsagiVoiceMode = "zh"; // 默认优先使用中文版
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
      const savedMode = localStorage.getItem("jobhunter_usagi_voice_mode") as UsagiVoiceMode | null;
      if (savedMode === "zh" || savedMode === "ja") {
        this.voiceMode = savedMode;
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

  public getVoiceMode(): UsagiVoiceMode {
    return this.voiceMode;
  }

  public setVoiceMode(mode: UsagiVoiceMode) {
    this.voiceMode = mode;
    try {
      localStorage.setItem("jobhunter_usagi_voice_mode", mode);
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
   * 播放单体拟声音效
   */
  public play(type: UsagiSound) {
    if (!this.soundEnabled || this.volume <= 0) return;

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
          this.playSynthetic(type);
        });
      }
    } catch {
      this.playSynthetic(type);
    }
  }

  /**
   * 场景化语音综合表达：
   * 结合动作拟声切片 + 中文版高萌语音朗读（当语音模式为中文时）
   */
  public speak(text: string, soundType?: UsagiSound) {
    if (!this.soundEnabled || this.volume <= 0) return;

    // 先播放乌萨奇标志性高能拟声
    if (soundType) {
      this.play(soundType);
    }

    // 若当前为中文版语音模式，且有有效文本，调用高音调拟人中文萌音朗读
    if (this.voiceMode === "zh" && text && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        // 清理特殊符号，提取自然中文
        const clean = text
          .replace(/[ヤハウラプルルルルル〜~*^▽^*≧∇≦🌀💥🐾🎈⏰🍵🌟💪🔥]/g, "")
          .replace(/[！!？?，,。.]/g, " ")
          .trim();

        if (clean) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(clean);
          utter.volume = Math.min(1, this.volume * 1.1);
          utter.pitch = 1.85; // 调高音调，呈现乌萨奇专属高音萌音
          utter.rate = 1.25;  // 稍快语速，呈现活泼跳脱性格
          utter.lang = "zh-CN";

          const voices = window.speechSynthesis.getVoices();
          const zhVoice = voices.find(
            (v) =>
              v.lang.includes("zh") &&
              (v.name.includes("Xiaoxiao") ||
                v.name.includes("Huihui") ||
                v.name.includes("Natural") ||
                v.name.includes("Female"))
          );
          if (zhVoice) {
            utter.voice = zhVoice;
          }

          // 延迟 200ms 等待前置短叫声先发声
          setTimeout(() => {
            try {
              window.speechSynthesis.speak(utter);
            } catch {}
          }, 200);
        }
      } catch {}
    }
  }

  public stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

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
