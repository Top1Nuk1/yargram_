import { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  PictureInPicture,
  ScreenShare,
  ScreenShareOff,
  Search,
  Settings2,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Timer,
  UserPlus,
  UsersRound,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { Avatar, Button, IconButton, Spinner } from '../../components/ui';
import type { TranslateFn } from '../../hooks/useLanguage';
import { useTranslation } from '../../hooks/useLanguage';
import { avatarProps } from '../../lib/user';
import type { User } from '../../types';
import {
  DEFAULT_CALL_SETTINGS,
  EMPTY_CALL_DEVICES,
  type CallDevices,
  type CallSettings,
  type VideoQuality,
} from './callSettings';
import type { ActiveCall, ConnectionQuality } from './useWebRtcCall';

interface CallOverlayProps {
  call: ActiveCall | null;
  error: string;
  onDismissError: () => void;
  onAccept: () => void;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  onEnd: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void | Promise<void>;
  localVideoRef: (element: HTMLVideoElement | null) => void;
  remoteVideoRef: (element: HTMLVideoElement | null) => void;
  remoteVideoRefFor?: (userId: string) => (element: HTMLVideoElement | null) => void;
  token?: string;
  onInvite?: (userId: string) => void;
  settings?: CallSettings;
  devices?: CallDevices;
  onSettingsChange?: (patch: Partial<CallSettings>) => void | Promise<void>;
  onRefreshDevices?: () => void | Promise<void>;
  onToggleScreenShare?: () => void | Promise<void>;
  onRemoteVolumeChange?: (value: number) => void;
}

const statusKey: Record<'incoming' | 'outgoing' | 'connecting' | 'active', string> = {
  incoming: 'calls.incomingCall',
  outgoing: 'calls.outgoingCall',
  connecting: 'calls.connecting',
  active: 'calls.active',
};

const qualityKey: Record<ConnectionQuality, string> = {
  unknown: 'calls.qualityUnknown',
  excellent: 'calls.qualityExcellent',
  good: 'calls.qualityGood',
  poor: 'calls.qualityPoor',
};

/** Короткая подпись состояния звонка — переводится по месту. */
function statusTextFor(t: TranslateFn, status: keyof typeof statusKey): string {
  return t(statusKey[status]);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function QualityIcon({ quality }: { quality: ConnectionQuality }) {
  if (quality === 'poor') return <SignalLow className="h-4 w-4 text-amber-300" aria-hidden="true" />;
  if (quality === 'good') return <SignalMedium className="h-4 w-4 text-sky-300" aria-hidden="true" />;
  return <SignalHigh className={`h-4 w-4 ${quality === 'excellent' ? 'text-emerald-300' : 'text-white/55'}`} aria-hidden="true" />;
}

function DeviceSelect({
  label,
  value,
  devices,
  emptyText,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  emptyText: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <label className="block text-left text-xs font-semibold text-white/65">
      {label}
      <select
        className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition focus:border-white/30"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" className="bg-[#202033]">{t('calls.systemDevice')}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId} className="bg-[#202033]">
            {device.label || `${emptyText} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1 text-left text-sm text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[#3390ec]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function InviteParticipantModal({
  token,
  currentUserIds,
  onClose,
  onInvite,
}: {
  token: string;
  currentUserIds: Set<string>;
  onClose: () => void;
  onInvite: (userId: string) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError('');
      return undefined;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError('');
      api
        .users(token, trimmed)
        .then((result) => setResults(result.items.filter((user) => !currentUserIds.has(user.id))))
        .catch(() => setSearchError(t('calls.usersSearchFailed')))
        .finally(() => setSearching(false));
    }, 250);
    timerRef.current = timer;
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [currentUserIds, query, t, token]);

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('calls.inviteParticipant')}>
      <div className="w-full max-w-md animate-slide-up overflow-hidden rounded-2xl border border-white/10 bg-[#202033] text-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <UserPlus className="h-5 w-5 text-white/70" />
          <h3 className="flex-1 text-sm font-bold">{t('calls.inviteToCall')}</h3>
          <IconButton label={t('common.close')} className="text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="p-4">
          <label className="relative block">
            <span className="sr-only">{t('calls.searchUser')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('calls.searchPlaceholder')}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/10 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/30"
            />
          </label>
          <div className="mt-3 max-h-64 overflow-y-auto">
            {searching && <div className="flex justify-center py-6"><Spinner className="h-5 w-5 text-white/60" /></div>}
            {searchError && <p className="py-4 text-center text-sm text-red-300">{searchError}</p>}
            {!searching && !searchError && query.trim() && results.length === 0 && (
              <p className="py-4 text-center text-sm text-white/45">{t('calls.noUsersFound')}</p>
            )}
            <ul className="space-y-1">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/10"
                    onClick={() => {
                      onInvite(user.id);
                      onClose();
                    }}
                  >
                    <Avatar name={user.displayName} src={user.avatarUrl} size="sm" {...avatarProps(user)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{user.displayName}</span>
                      {user.username && <span className="block truncate text-xs text-white/45">@{user.username}</span>}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-brand/30 px-2.5 py-1 text-[11px] font-bold text-white">
                      <UserPlus className="h-3 w-3" /> {t('calls.ask')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CallOverlay({
  call,
  error,
  onDismissError,
  onAccept,
  onAcceptInvite,
  onDeclineInvite,
  onEnd,
  onToggleMicrophone,
  onToggleCamera,
  localVideoRef,
  remoteVideoRef,
  remoteVideoRefFor,
  token,
  onInvite,
  settings = DEFAULT_CALL_SETTINGS,
  devices = EMPTY_CALL_DEVICES,
  onSettingsChange,
  onRefreshDevices,
  onToggleScreenShare,
  onRemoteVolumeChange,
}: CallOverlayProps) {
  const t = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pipVideo, setPipVideo] = useState<HTMLVideoElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setSettingsOpen(false);
    setMinimized(false);
    setInviteOpen(false);
  }, [call?.callId]);

  useEffect(() => {
    if (!call?.startedAt || call.status !== 'active') return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [call?.startedAt, call?.status]);

  useEffect(() => {
    return () => {
      if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    };
  }, []);

  const chainedRemoteVideoRef = (element: HTMLVideoElement | null) => {
    remoteVideoRef(element);
    setPipVideo(element);
  };

  const pipSupported =
    typeof document !== 'undefined'
    && 'pictureInPictureEnabled' in document
    && document.pictureInPictureEnabled;

  const togglePip = async () => {
    const video = pipVideo;
    if (!video || !pipSupported) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    try {
      await video.requestPictureInPicture();
    } catch {
      // PiP can be unavailable while the element is hidden.
    }
  };

  if (!call && !error) return null;

  const primary = call?.links[0];
  const remoteVideoAvailable = Boolean(primary?.videoAvailable);
  const remoteScreenSharing = Boolean(primary?.screenSharing);
  const remoteMicrophoneEnabled = primary?.microphoneEnabled ?? true;
  const extraLinks = call?.links.slice(1) ?? [];

  const elapsed = call && call.startedAt
    ? Math.max(0, Math.floor((now - call.startedAt) / 1_000))
    : 0;

  if (call && minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[90] w-72 animate-slide-up overflow-hidden rounded-2xl border border-white/10 bg-[#171724]/95 text-white shadow-2xl backdrop-blur-xl">
        <video
          ref={chainedRemoteVideoRef}
          autoPlay
          playsInline
          className={`h-28 w-full transition-opacity duration-300 ${remoteVideoAvailable ? 'opacity-100' : 'opacity-0'}`}
        />
        <button type="button" className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 transition hover:bg-black/70 ${remoteVideoAvailable ? '' : 'hidden'}`} onClick={() => void togglePip()} aria-label={t('calls.pictureInPicture')} title={t('calls.openSeparateWindow')}>
          <PictureInPicture className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Avatar name={call.peer.displayName} src={call.peer.avatarUrl} size="sm" {...avatarProps(call.peer)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{call.peer.displayName}</p>
            <p className="text-[11px] text-white/55">
              {call.links.length > 1 ? `${t('calls.participantCount', { count: call.links.length })} · ` : ''}
              {call.status === 'active' && call.startedAt ? formatDuration(elapsed) : statusTextFor(t, call.status)}
            </p>
          </div>
          <IconButton label={t('calls.expandCall')} className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setMinimized(false)}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
          <IconButton label={t('calls.endCall')} className="h-9 w-9 rounded-full bg-danger text-white hover:bg-danger/85" onClick={onEnd}>
            <PhoneOff className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="fixed inset-x-4 top-4 z-[90] mx-auto max-w-xl animate-slide-up rounded-2xl border border-danger/20 bg-surface p-4 shadow-float" role="alert">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><PhoneOff className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t('calls.callUnavailable')}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{error}</p>
            {!window.isSecureContext && (
              <p className="mt-2 text-sm leading-6 text-muted">
                {t('calls.secureContextHintPrefix')}
                <span className="font-semibold text-brand"> https://{window.location.hostname}:3443 </span>
                {t('calls.secureContextHintSuffix')}
              </p>
            )}
          </div>
          <IconButton label={t('common.close')} onClick={onDismissError}><X className="h-5 w-5" /></IconButton>
        </div>
      </div>
    );
  }

  const videoLayout = call.mode === 'video' || call.screenSharing || remoteScreenSharing;
  const settingsAvailable = Boolean(onSettingsChange);
  const controlsDisabled = !call.mediaReady;
  const canInvite = call.status === 'active' && Boolean(token && onInvite) && call.links.length < 4;

  const changeSetting = <Key extends keyof CallSettings>(key: Key, value: CallSettings[Key]) => {
    void onSettingsChange?.({ [key]: value } as Pick<CallSettings, Key>);
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#080810]/92 p-2 text-white backdrop-blur-xl sm:p-6">
      <section className="relative flex h-full max-h-[860px] w-full max-w-[1160px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#171724] shadow-2xl sm:rounded-[2rem]">
        <video
          ref={chainedRemoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 h-full w-full transition duration-500 ${
            remoteScreenSharing ? 'bg-[#0a0a14] object-contain' : 'object-cover'
          } ${videoLayout && remoteVideoAvailable ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
        />

        <div className={`absolute inset-0 grid place-items-center bg-[#17212b] transition-opacity duration-500 ${
          videoLayout && remoteVideoAvailable ? 'opacity-0' : 'opacity-100'
        }`}>
          <div className={`text-center ${call.status === 'incoming' || call.status === 'outgoing' ? 'animate-pulse' : ''}`}>
            <Avatar name={call.peer.displayName} src={call.peer.avatarUrl} size="xl" className="scale-125" {...avatarProps(call.peer)} />
            <h2 className="mt-8 max-w-[80vw] truncate text-2xl font-extrabold sm:text-3xl">{call.peer.displayName}</h2>
            {call.peer.username && <p className="mt-1 text-sm text-white/50">@{call.peer.username}</p>}
            {call.invited && (
              <p className="mt-2 text-sm text-white/65">
                {t('calls.invitation')}{call.links.length > 0 ? ` (${call.links.length + 1})` : ''}
              </p>
            )}
          </div>
        </div>

        {extraLinks.length > 0 && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap justify-center gap-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
            {extraLinks.map((link) => (
              <div key={link.userId} className="pointer-events-auto relative h-28 w-36 overflow-hidden rounded-xl border border-white/15 bg-[#101019] shadow-xl">
                <video
                  ref={remoteVideoRefFor?.(link.userId)}
                  autoPlay
                  playsInline
                  className={`h-full w-full transition-opacity duration-300 ${
                    link.screenSharing ? 'bg-[#0a0a14] object-contain' : 'object-cover'
                  } ${link.videoAvailable ? 'opacity-100' : 'opacity-0'}`}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[10px] font-bold">
                  {!link.microphoneEnabled && <MicOff className="h-3 w-3 text-red-300" />}
                  {link.screenSharing && <ScreenShare className="h-3 w-3 text-brand" />}
                  <span className="truncate">{link.user.displayName}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-black/65 to-transparent px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
              {call.direction === 'incoming' ? t('calls.incoming') : t('calls.outgoing')} {call.initialMode === 'video' ? t('calls.videoCallType') : t('calls.audioCallType')}
            </span>
            {call.links.length > 1 && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/85">
                <UsersRound className="h-3.5 w-3.5" /> {t('calls.participantCount', { count: call.links.length })}
              </span>
            )}
            {remoteScreenSharing && (
              <span className="flex items-center gap-1.5 rounded-full bg-brand/75 px-3 py-1.5 text-xs font-semibold">
                <ScreenShare className="h-3.5 w-3.5" /> {t('calls.peerSharingScreen')}
              </span>
            )}
            {!remoteMicrophoneEnabled && call.status === 'active' && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/80">
                <MicOff className="h-3.5 w-3.5" /> {t('calls.microphoneOff')}
              </span>
            )}
          </div>
          {call.status === 'active' && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
              <QualityIcon quality={call.connectionQuality} /> {t(qualityKey[call.connectionQuality])}
            </span>
          )}
          <div className="flex items-center gap-2">
            {videoLayout && remoteVideoAvailable && pipSupported && call.status === 'active' && (
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/35 text-white/85 backdrop-blur-md transition hover:bg-black/60"
                onClick={() => void togglePip()}
                aria-label={t('calls.openVideoSeparateWindow')}
                title={t('calls.pictureInPicture')}
              >
                <PictureInPicture className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/35 text-white/85 backdrop-blur-md transition hover:bg-black/60"
              onClick={() => setMinimized(true)}
              aria-label={t('calls.minimizeCall')}
              title={t('calls.minimizeHint')}
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {call.mediaReady && (
          <div className="absolute right-3 top-20 h-32 w-24 overflow-hidden rounded-2xl border border-white/20 bg-[#101019] shadow-xl transition sm:right-6 sm:top-24 sm:h-48 sm:w-32">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full transition-opacity duration-300 ${
                call.screenSharing ? 'bg-[#0a0a14] object-contain' : 'object-cover'
              } ${call.cameraEnabled || call.screenSharing ? 'opacity-100' : 'opacity-0'}`}
            />
            {!call.cameraEnabled && !call.screenSharing && (
              <span className="absolute inset-0 grid place-items-center text-white/55">
                <VideoOff className="h-7 w-7" aria-hidden="true" />
              </span>
            )}
            {call.screenSharing && (
              <span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-lg bg-brand/85 px-1 py-1 text-[10px] font-bold">
                <ScreenShare className="h-3 w-3" /> {t('calls.yourScreen')}
              </span>
            )}
          </div>
        )}

        {settingsOpen && settingsAvailable && (
          <aside className="absolute bottom-28 right-3 z-20 max-h-[min(620px,calc(100%-8rem))] w-[min(360px,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#202033]/95 p-4 shadow-2xl backdrop-blur-xl sm:bottom-32 sm:right-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold">{t('calls.settings')}</h3>
                <p className="mt-0.5 text-xs text-white/45">{t('calls.settingsSaved')}</p>
              </div>
              <IconButton label={t('calls.closeSettings')} className="text-white/65 hover:bg-white/10 hover:text-white" onClick={() => setSettingsOpen(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="space-y-3">
              <DeviceSelect label={t('calls.microphone')} value={settings.microphoneId} devices={devices.microphones} emptyText={t('calls.microphone')} onChange={(value) => changeSetting('microphoneId', value)} />
              <DeviceSelect label={t('calls.camera')} value={settings.cameraId} devices={devices.cameras} emptyText={t('calls.camera')} onChange={(value) => changeSetting('cameraId', value)} />
              <DeviceSelect label={t('calls.speakers')} value={settings.speakerId} devices={devices.speakers} emptyText={t('calls.speakers')} onChange={(value) => changeSetting('speakerId', value)} />

              <label className="block text-left text-xs font-semibold text-white/65">
                {t('calls.videoQuality')}
                <select
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-white outline-none transition focus:border-white/30"
                  value={settings.videoQuality}
                  onChange={(event) => changeSetting('videoQuality', event.target.value as VideoQuality)}
                >
                  <option value="data-saver" className="bg-[#202033]">{t('calls.qualityDataSaver')}</option>
                  <option value="standard" className="bg-[#202033]">{t('calls.qualityStandard')}</option>
                  <option value="high" className="bg-[#202033]">{t('calls.qualityHigh')}</option>
                </select>
              </label>
            </div>

            <div className="my-4 h-px bg-white/10" />
            <div className="space-y-2">
              <ToggleSetting label={t('calls.autoCamera')} checked={settings.autoEnableCamera} onChange={(value) => changeSetting('autoEnableCamera', value)} />
              <ToggleSetting label={t('calls.noiseSuppression')} checked={settings.noiseSuppression} onChange={(value) => changeSetting('noiseSuppression', value)} />
              <ToggleSetting label={t('calls.echoCancellation')} checked={settings.echoCancellation} onChange={(value) => changeSetting('echoCancellation', value)} />
            </div>
          </aside>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 text-center sm:px-6 sm:pb-6">
          <h2 className="truncate text-lg font-extrabold sm:text-xl">
            {call.peer.displayName}
            {call.links.length > 1 && <span className="text-white/60"> +{call.links.length - 1}</span>}
          </h2>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/65">
            <span>{statusTextFor(t, call.status)}</span>
            {call.status === 'active' && call.startedAt && (
              <span className="flex items-center gap-1 font-mono text-white/80"><Timer className="h-3.5 w-3.5" />{formatDuration(elapsed)}</span>
            )}
          </div>

          {error && <p className="mx-auto mt-3 max-w-lg rounded-xl bg-danger/25 px-3 py-2 text-sm text-red-100">{error}</p>}

          {call.status !== 'incoming' && onRemoteVolumeChange && (
            <label className="mx-auto mt-3 flex max-w-xs items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs text-white/65">
              <Volume2 className="h-4 w-4 shrink-0" />
              <span className="sr-only">{t('calls.peerVolume')}</span>
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={call.remoteVolume}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#3390ec]"
                onChange={(event) => onRemoteVolumeChange(Number(event.target.value))}
              />
              <span className="w-10 text-right font-semibold text-white/80">{call.remoteVolume}%</span>
            </label>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2.5 sm:gap-3">
            {call.status === 'incoming' ? (
              <>
                <Button className="h-14 rounded-full bg-success px-6 hover:bg-success/90" onClick={call.invited ? onAcceptInvite : onAccept}>
                  <Phone className="h-5 w-5" /> {call.invited ? t('calls.joinCall') : t('calls.accept')}
                </Button>
                <Button className="h-14 rounded-full bg-danger px-6 hover:bg-danger/90" onClick={call.invited ? onDeclineInvite : onEnd}>
                  <PhoneOff className="h-5 w-5" /> {t('calls.decline')}
                </Button>
              </>
            ) : (
              <>
                <IconButton
                  label={call.microphoneEnabled ? t('calls.muteMicrophone') : t('calls.unmuteMicrophone')}
                  className={`h-14 w-14 rounded-full text-white hover:text-white ${call.microphoneEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-[#171724] hover:bg-white/90 hover:text-[#171724]'}`}
                  disabled={controlsDisabled}
                  onClick={onToggleMicrophone}
                >
                  {call.microphoneEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                </IconButton>
                <IconButton
                  label={call.cameraEnabled ? t('calls.turnCameraOff') : t('calls.turnCameraOn')}
                  className={`h-14 w-14 rounded-full text-white hover:text-white ${call.cameraEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-[#171724] hover:bg-white/90 hover:text-[#171724]'}`}
                  disabled={controlsDisabled}
                  onClick={() => void onToggleCamera()}
                >
                  {call.cameraEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                </IconButton>
                {canInvite && (
                  <IconButton
                    label={t('calls.inviteParticipant')}
                    className={`h-14 w-14 rounded-full text-white hover:text-white ${inviteOpen ? 'bg-brand hover:bg-brand/85' : 'bg-white/15 hover:bg-white/25'}`}
                    onClick={() => setInviteOpen((open) => !open)}
                  >
                    <UserPlus className="h-6 w-6" />
                  </IconButton>
                )}
                {onToggleScreenShare && (
                  <IconButton
                    label={call.screenSharing ? t('calls.stopScreenShare') : t('calls.shareScreen')}
                    className={`h-14 w-14 rounded-full text-white hover:text-white ${call.screenSharing ? 'bg-brand hover:bg-brand/85' : 'bg-white/15 hover:bg-white/25'}`}
                    disabled={controlsDisabled}
                    onClick={() => void onToggleScreenShare()}
                  >
                    {call.screenSharing ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
                  </IconButton>
                )}
                {settingsAvailable && (
                  <IconButton
                    label={t('calls.settings')}
                    className={`h-14 w-14 rounded-full text-white hover:text-white ${settingsOpen ? 'bg-brand hover:bg-brand/85' : 'bg-white/15 hover:bg-white/25'}`}
                    onClick={() => {
                      const next = !settingsOpen;
                      setSettingsOpen(next);
                      if (next) void onRefreshDevices?.();
                    }}
                  >
                    <Settings2 className="h-6 w-6" />
                  </IconButton>
                )}
                <IconButton
                  label={t('calls.endCall')}
                  className="h-14 w-14 rounded-full bg-danger text-white hover:bg-danger/85 hover:text-white"
                  onClick={onEnd}
                >
                  <PhoneOff className="h-6 w-6" />
                </IconButton>
              </>
            )}
          </div>
        </div>
      </section>

      {inviteOpen && token && onInvite && (
        <InviteParticipantModal
          token={token}
          currentUserIds={new Set(call.links.map((link) => link.userId))}
          onClose={() => setInviteOpen(false)}
          onInvite={onInvite}
        />
      )}
    </div>
  );
}
