import { dynamicIceServers } from './turnCredentials';

export type VideoQuality = 'data-saver' | 'standard' | 'high';

export interface CallSettings {
  microphoneId: string;
  cameraId: string;
  speakerId: string;
  videoQuality: VideoQuality;
  autoEnableCamera: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

export interface CallDevices {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

export const DEFAULT_CALL_SETTINGS: CallSettings = {
  microphoneId: '',
  cameraId: '',
  speakerId: '',
  videoQuality: 'high',
  autoEnableCamera: true,
  noiseSuppression: true,
  echoCancellation: true,
};

export const EMPTY_CALL_DEVICES: CallDevices = {
  microphones: [],
  cameras: [],
  speakers: [],
};

const SETTINGS_STORAGE_KEY = 'yargram.call.settings.v1';
const VOLUME_STORAGE_PREFIX = 'yargram.call.volume.v1.';

const VIDEO_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  'data-saver': {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 15, max: 20 },
  },
  standard: {
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 24, max: 30 },
  },
  high: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
};

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isVideoQuality(value: unknown): value is VideoQuality {
  return value === 'data-saver' || value === 'standard' || value === 'high';
}

export function loadCallSettings(): CallSettings {
  try {
    const value = storage()?.getItem(SETTINGS_STORAGE_KEY);
    if (!value) return { ...DEFAULT_CALL_SETTINGS };
    const parsed = JSON.parse(value) as Partial<CallSettings>;
    return {
      microphoneId: typeof parsed.microphoneId === 'string' ? parsed.microphoneId : '',
      cameraId: typeof parsed.cameraId === 'string' ? parsed.cameraId : '',
      speakerId: typeof parsed.speakerId === 'string' ? parsed.speakerId : '',
      videoQuality: isVideoQuality(parsed.videoQuality) ? parsed.videoQuality : 'high',
      autoEnableCamera: typeof parsed.autoEnableCamera === 'boolean' ? parsed.autoEnableCamera : true,
      noiseSuppression: typeof parsed.noiseSuppression === 'boolean' ? parsed.noiseSuppression : true,
      echoCancellation: typeof parsed.echoCancellation === 'boolean' ? parsed.echoCancellation : true,
    };
  } catch {
    return { ...DEFAULT_CALL_SETTINGS };
  }
}

export function saveCallSettings(settings: CallSettings): void {
  try {
    storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private browser session may reject localStorage. The call still works for this session.
  }
}

export function clampRemoteVolume(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(200, Math.max(0, Math.round(value)));
}

export function loadConversationVolume(conversationId: string): number {
  try {
    const value = storage()?.getItem(`${VOLUME_STORAGE_PREFIX}${conversationId}`);
    return value === null || value === undefined ? 100 : clampRemoteVolume(Number(value));
  } catch {
    return 100;
  }
}

export function saveConversationVolume(conversationId: string, value: number): void {
  try {
    storage()?.setItem(`${VOLUME_STORAGE_PREFIX}${conversationId}`, String(clampRemoteVolume(value)));
  } catch {
    // Volume persistence is optional when browser storage is unavailable.
  }
}

export function audioConstraints(settings: CallSettings): MediaTrackConstraints {
  return {
    ...(settings.microphoneId ? { deviceId: { ideal: settings.microphoneId } } : {}),
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
  };
}

export function videoConstraints(settings: CallSettings): MediaTrackConstraints {
  return {
    ...VIDEO_CONSTRAINTS[settings.videoQuality],
    ...(settings.cameraId ? { deviceId: { ideal: settings.cameraId } } : {}),
  };
}

export async function enumerateCallDevices(): Promise<CallDevices> {
  if (!navigator.mediaDevices?.enumerateDevices) return { ...EMPTY_CALL_DEVICES };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    microphones: devices.filter((device) => device.kind === 'audioinput'),
    cameras: devices.filter((device) => device.kind === 'videoinput'),
    speakers: devices.filter((device) => device.kind === 'audiooutput'),
  };
}

/**
 * ICE-серверы для звонка: через них браузеры находят друг друга.
 *
 * 🔥 `stun` только сообщает каждому участнику его внешний адрес. Если NAT у
 * собеседников «симметричный» (мобильный интернет, часть корпоративных сетей),
 * прямое соединение не установится вовсе — нужен `turn`: он **перегоняет**
 * медиапоток через себя. Работа надёжных звонков без своего `turn` невозможна,
 * поэтому адрес релея задаётся сборкой:
 *
 *   VITE_TURN_URL=turn:203.0.113.7:3478
 *   VITE_TURN_USERNAME=yargram
 *   VITE_TURN_CREDENTIAL=<пароль>
 *
 * Пока переменные не заданы, остаётся только публичный STUN — этого хватает
 * внутри одной локальной сети и через VPN, но не всегда хватает в интернете.
 *
 * 🔥 Свой `coturn` есть не везде: на хостинге приложений нет ни root, ни UDP.
 * На такой случай реле запрашиваются у своего сервера перед звонком
 * (`turnCredentials.ts`), и здесь они добавляются к тем, что из сборки.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    },
  ];
  const turnUrl = (import.meta.env.VITE_TURN_URL ?? '').trim();
  if (turnUrl) {
    const username = (import.meta.env.VITE_TURN_USERNAME ?? '').trim();
    const credential = (import.meta.env.VITE_TURN_CREDENTIAL ?? '').trim();
    servers.push({
      urls: turnUrl.split(',').map((url: string) => url.trim()).filter(Boolean),
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }
  servers.push(...dynamicIceServers());
  return servers;
}
