export type YargramSound = 'message' | 'sent' | 'call';

const SOUND_SETTING_KEY = 'yargram.sound.enabled';
const SOUND_SETTING_EVENT = 'yargram:sound-setting';

let audioContext: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_SETTING_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_SETTING_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<boolean>(SOUND_SETTING_EVENT, { detail: enabled }));
  }
}

export function subscribeToSoundSetting(listener: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onSetting = (event: Event) => {
    listener((event as CustomEvent<boolean>).detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUND_SETTING_KEY) listener(event.newValue !== 'false');
  };
  window.addEventListener(SOUND_SETTING_EVENT, onSetting);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SOUND_SETTING_EVENT, onSetting);
    window.removeEventListener('storage', onStorage);
  };
}

export function playSound(sound: YargramSound): void {
  if (!isSoundEnabled() || typeof window === 'undefined') return;

  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const now = context.currentTime + 0.015;
    const tones = soundPattern(sound);
    for (const tone of tones) {
      scheduleTone(context, now + tone.offset, tone.frequency, tone.duration, tone.volume);
    }
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

function getAudioContext(): AudioContext | null {
  if (audioContext && audioContext.state !== 'closed') return audioContext;

  const BrowserAudioContext =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserAudioContext) return null;

  try {
    audioContext = new BrowserAudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

function soundPattern(sound: YargramSound): Array<{
  offset: number;
  frequency: number;
  duration: number;
  volume: number;
}> {
  switch (sound) {
    case 'sent':
      return [
        { offset: 0, frequency: 620, duration: 0.055, volume: 0.035 },
        { offset: 0.055, frequency: 840, duration: 0.075, volume: 0.025 },
      ];
    case 'call':
      return [
        { offset: 0, frequency: 523.25, duration: 0.28, volume: 0.22 },
        { offset: 0.02, frequency: 659.25, duration: 0.28, volume: 0.22 },
        { offset: 0.45, frequency: 523.25, duration: 0.32, volume: 0.22 },
        { offset: 0.47, frequency: 659.25, duration: 0.35, volume: 0.22 },
      ];
    case 'message':
    default:
      return [
        { offset: 0, frequency: 880, duration: 0.08, volume: 0.04 },
        { offset: 0.085, frequency: 1_120, duration: 0.11, volume: 0.03 },
      ];
  }
}

function scheduleTone(
  context: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  volume: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
}
