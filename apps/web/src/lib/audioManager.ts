export interface ActiveAudioInfo {
  id: string;
  url: string;
  title: string;
  senderName?: string;
  duration?: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: 1 | 1.5 | 2;
}

type AudioListener = () => void;

class GlobalAudioManager {
  private currentInfo: ActiveAudioInfo | null = null;
  private localAudio: HTMLAudioElement | null = null;
  private fallbackAudio: HTMLAudioElement | null = null;
  private listeners = new Set<AudioListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initFallback();
    }
  }

  private initFallback() {
    const audio = new Audio();
    audio.preload = 'metadata';

    audio.addEventListener('play', () => {
      if (this.currentInfo) {
        this.currentInfo.isPlaying = true;
        this.notify();
      }
    });

    audio.addEventListener('pause', () => {
      if (this.currentInfo) {
        this.currentInfo.isPlaying = false;
        this.notify();
      }
    });

    audio.addEventListener('timeupdate', () => {
      if (this.currentInfo && this.fallbackAudio) {
        this.currentInfo.currentTime = Number.isFinite(this.fallbackAudio.currentTime)
          ? this.fallbackAudio.currentTime
          : 0;
        this.notify();
      }
    });

    audio.addEventListener('ended', () => {
      if (this.currentInfo) {
        this.currentInfo.isPlaying = false;
        this.currentInfo.currentTime = 0;
        this.notify();
      }
    });

    audio.addEventListener('durationchange', () => {
      if (this.currentInfo && this.fallbackAudio && Number.isFinite(this.fallbackAudio.duration) && this.fallbackAudio.duration > 0) {
        this.currentInfo.duration = this.fallbackAudio.duration;
        this.notify();
      }
    });

    this.fallbackAudio = audio;
  }

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.currentInfo = this.currentInfo ? { ...this.currentInfo } : null;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }

  getInfo(): ActiveAudioInfo | null {
    return this.currentInfo;
  }

  registerLocalPlay(
    id: string,
    url: string,
    title: string,
    duration: number | undefined,
    audioElement: HTMLAudioElement,
    playbackRate: 1 | 1.5 | 2,
  ) {
    if (this.fallbackAudio && !this.fallbackAudio.paused) {
      this.fallbackAudio.pause();
    }

    this.localAudio = audioElement;
    this.currentInfo = {
      id,
      url,
      title,
      duration,
      currentTime: Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0,
      isPlaying: true,
      playbackRate,
    };
    this.notify();
  }

  updateLocalTime(id: string, currentTime: number, duration?: number) {
    if (this.currentInfo?.id === id) {
      this.currentInfo.currentTime = currentTime;
      if (duration && !this.currentInfo.duration) {
        this.currentInfo.duration = duration;
      }
      this.notify();
    }
  }

  updateLocalPlaying(id: string, isPlaying: boolean) {
    if (this.currentInfo?.id === id) {
      this.currentInfo.isPlaying = isPlaying;
      this.notify();
    }
  }

  handleLocalUnmount(id: string, audioElement: HTMLAudioElement) {
    if (this.currentInfo?.id === id) {
      this.localAudio = null;
      if (!audioElement.paused && this.fallbackAudio) {
        const time = audioElement.currentTime;
        const rate = this.currentInfo.playbackRate;
        this.fallbackAudio.src = this.currentInfo.url;
        this.fallbackAudio.currentTime = time;
        this.fallbackAudio.playbackRate = rate;
        void this.fallbackAudio.play().catch(() => {});
      }
    }
  }

  togglePlay() {
    if (!this.currentInfo) return;

    if (this.localAudio && typeof document !== 'undefined' && document.contains(this.localAudio)) {
      if (this.localAudio.paused) {
        void this.localAudio.play().catch(() => {});
      } else {
        this.localAudio.pause();
      }
      return;
    }

    if (this.fallbackAudio) {
      if (this.fallbackAudio.paused) {
        if (!this.fallbackAudio.src || !this.fallbackAudio.src.includes(this.currentInfo.url)) {
          this.fallbackAudio.src = this.currentInfo.url;
          this.fallbackAudio.currentTime = this.currentInfo.currentTime;
        }
        this.fallbackAudio.playbackRate = this.currentInfo.playbackRate;
        void this.fallbackAudio.play().catch(() => {});
      } else {
        this.fallbackAudio.pause();
      }
    }
  }

  seek(seconds: number) {
    if (!this.currentInfo) return;
    const safeSec = Math.max(0, seconds);
    this.currentInfo.currentTime = safeSec;

    if (this.localAudio && typeof document !== 'undefined' && document.contains(this.localAudio)) {
      try {
        this.localAudio.currentTime = safeSec;
      } catch {}
    } else if (this.fallbackAudio) {
      try {
        this.fallbackAudio.currentTime = safeSec;
      } catch {}
    }
    this.notify();
  }

  setSpeed(speed: 1 | 1.5 | 2) {
    if (!this.currentInfo) return;
    this.currentInfo.playbackRate = speed;
    if (this.localAudio && typeof document !== 'undefined' && document.contains(this.localAudio)) {
      this.localAudio.playbackRate = speed;
    }
    if (this.fallbackAudio) {
      this.fallbackAudio.playbackRate = speed;
    }
    this.notify();
  }

  close() {
    if (this.localAudio && typeof document !== 'undefined' && document.contains(this.localAudio)) {
      this.localAudio.pause();
    }
    if (this.fallbackAudio) {
      this.fallbackAudio.pause();
      this.fallbackAudio.src = '';
    }
    this.currentInfo = null;
    this.localAudio = null;
    this.notify();
  }
}

export const audioManager = new GlobalAudioManager();
