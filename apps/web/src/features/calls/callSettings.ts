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
