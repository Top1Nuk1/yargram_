import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { playSound } from '../../lib/sounds';
import type { User } from '../../types';
import {
  audioConstraints,
  clampRemoteVolume,
  EMPTY_CALL_DEVICES,
  enumerateCallDevices,
  loadCallSettings,
  loadConversationVolume,
  saveCallSettings,
  saveConversationVolume,
  videoConstraints,
  type CallDevices,
  type CallSettings,
} from './callSettings';

export type CallMode = 'audio' | 'video';
export type CallStatus = 'incoming' | 'outgoing' | 'connecting' | 'active';
export type CallDirection = 'incoming' | 'outgoing';
export type ConnectionQuality = 'unknown' | 'excellent' | 'good' | 'poor';
export type LinkDirection = 'outgoing' | 'incoming';
export type LinkStatus = 'ringing' | 'connecting' | 'connected';

export interface CallLink {
  userId: string;
  user: User;
  direction: LinkDirection;
  status: LinkStatus;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  videoAvailable: boolean;
  volume: number;
  connectionQuality: ConnectionQuality;
}

export interface ActiveCall {
  callId: string;
  conversationId: string;
  initialMode: CallMode;
  mode: CallMode;
  direction: CallDirection;
  status: CallStatus;
  peer: User;
  links: CallLink[];
  invited: boolean;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  remoteVolume: number;
  connectionQuality: ConnectionQuality;
  mediaReady: boolean;
  startedAt: number | null;
}

interface IncomingCallPayload {
  callId: string;
  conversationId: string;
  mode: CallMode;
  offer: RTCSessionDescriptionInit;
  fromUser: User;
}

interface CallAnswerPayload {
  callId: string;
  conversationId: string;
  answer: RTCSessionDescriptionInit;
}

interface IcePayload {
  callId: string;
  conversationId: string;
  candidate: RTCIceCandidateInit;
}

interface DirectedIcePayload extends IcePayload {
  fromUserId: string;
}

interface JoinOfferPayload {
  callId: string;
  conversationId: string;
  fromUserId: string;
  offer: RTCSessionDescriptionInit;
}

interface JoinAnswerPayload {
  callId: string;
  conversationId: string;
  fromUserId: string;
  answer: RTCSessionDescriptionInit;
}

/** Новый offer внутри идущего звонка: демонстрация экрана или перезапуск ICE. */
interface RenegotiatePayload {
  callId: string;
  conversationId: string;
  fromUserId: string;
  offer: RTCSessionDescriptionInit;
}

interface RenegotiateAnswerPayload {
  callId: string;
  conversationId: string;
  fromUserId: string;
  answer: RTCSessionDescriptionInit;
}

interface ParticipantJoinedPayload {
  callId: string;
  conversationId: string;
  user: User;
}

interface ParticipantLeftPayload {
  callId: string;
  conversationId: string;
  userId: string;
}

interface InviteIncomingPayload {
  callId: string;
  conversationId: string;
  fromUser: User;
  mode: CallMode;
  participants: Array<{ id: string; displayName: string; username?: string | null }>;
}

interface BufferedCandidates {
  userId: string;
  callId: string;
  conversationId: string;
  candidates: RTCIceCandidateInit[];
  updatedAt: number;
}

interface MediaStatePacket {
  type: 'media-state';
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

interface AudioContextWithSink extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

type AudioContextConstructor = typeof AudioContext;

interface InternalLink {
  callId: string;
  conversationId: string;
  userId: string;
  user: User;
  direction: LinkDirection;
  connection: RTCPeerConnection | null;
  stream: MediaStream;
  channel: RTCDataChannel | null;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  videoElement: HTMLVideoElement | null;
  audioSource: MediaStreamAudioSourceNode | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  videoAvailable: boolean;
}

const OUTGOING_TIMEOUT_MS = 45_000;
const CANDIDATE_TTL_MS = 60_000;
const MAX_BUFFERED_CALLS = 8;
const MAX_CANDIDATES_PER_LINK = 64;
const MEDIA_CHANNEL_NAME = 'yargram-call-state-v1';

function secureContextError(): string {
  return `Для камеры и микрофона откройте защищённую версию: https://${window.location.hostname}:3443. Если друг подключается впервые, установите сертификат из файла Yargram-HTTPS-Setup.zip.`;
}

function mediaIsAvailable(): boolean {
  return window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

function createCallId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16));
  if (bytes) {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function audioContextConstructor(): AudioContextConstructor | null {
  const extendedWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? extendedWindow.webkitAudioContext ?? null;
}

function callModeForState(
  localCamera: boolean,
  localScreen: boolean,
  links: InternalLink[],
): CallMode {
  const remoteVideo = links.some(
    (link) => link.cameraEnabled || link.screenSharing || link.videoAvailable,
  );
  return localCamera || localScreen || remoteVideo ? 'video' : 'audio';
}

function isMediaStatePacket(value: unknown): value is MediaStatePacket {
  if (!value || typeof value !== 'object') return false;
  const packet = value as Partial<MediaStatePacket>;
  return packet.type === 'media-state'
    && typeof packet.microphoneEnabled === 'boolean'
    && typeof packet.cameraEnabled === 'boolean'
    && typeof packet.screenSharing === 'boolean';
}

function connectionQualityFromStats(report: RTCStatsReport): ConnectionQuality {
  let roundTripTime: number | null = null;
  let packetsLost = 0;
  let packetsReceived = 0;

  report.forEach((rawStat) => {
    const stat = rawStat as {
      type?: string;
      state?: string;
      nominated?: boolean;
      currentRoundTripTime?: number;
      roundTripTime?: number;
      packetsLost?: number;
      packetsReceived?: number;
    };
    if (
      stat.type === 'candidate-pair'
      && stat.state === 'succeeded'
      && (stat.nominated || roundTripTime === null)
      && typeof stat.currentRoundTripTime === 'number'
    ) {
      roundTripTime = stat.currentRoundTripTime;
    }
    if (stat.type === 'remote-inbound-rtp' && typeof stat.roundTripTime === 'number') {
      roundTripTime = roundTripTime === null
        ? stat.roundTripTime
        : Math.max(roundTripTime, stat.roundTripTime);
    }
    if (stat.type === 'inbound-rtp') {
      packetsLost += Math.max(0, stat.packetsLost ?? 0);
      packetsReceived += Math.max(0, stat.packetsReceived ?? 0);
    }
  });

  const totalPackets = packetsLost + packetsReceived;
  const lossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
  if (roundTripTime === null && totalPackets === 0) return 'unknown';
  if ((roundTripTime ?? 0) <= 0.15 && lossPercent < 2) return 'excellent';
  if ((roundTripTime ?? 0) <= 0.4 && lossPercent < 8) return 'good';
  return 'poor';
}

function stopTrack(track: MediaStreamTrack | null): void {
  if (!track) return;
  track.onended = null;
  track.stop();
}

export function useWebRtcCall(socket: Socket | null) {
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<CallSettings>(() => loadCallSettings());
  const [devices, setDevices] = useState<CallDevices>(EMPTY_CALL_DEVICES);
  const callRef = useRef<ActiveCall | null>(null);
  const settingsRef = useRef(settings);
  const socketRef = useRef<Socket | null>(socket);
  const linksRef = useRef<Map<string, InternalLink>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const microphoneTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const reportedModeRef = useRef<{ callId: string; mode: CallMode } | null>(null);
  const audioContextRef = useRef<AudioContextWithSink | null>(null);
  const remoteGainRef = useRef<GainNode | null>(null);
  const incomingOfferRef = useRef<IncomingCallPayload | null>(null);
  const invitePayloadRef = useRef<InviteIncomingPayload | null>(null);
  const pendingCandidatesRef = useRef<Map<string, BufferedCandidates>>(new Map());
  const iceRestartRef = useRef<Map<string, number>>(new Map());
  const operationRef = useRef(0);
  const outgoingTimeoutRef = useRef<number | null>(null);
  const localVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const primaryRemoteElementRef = useRef<HTMLVideoElement | null>(null);

  const updateCall = useCallback((next: ActiveCall | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const snapshotLinks = useCallback((): CallLink[] => {
    const active = callRef.current;
    if (!active) return [];
    return [...linksRef.current.values()].map((link) => ({
      userId: link.userId,
      user: link.user,
      direction: link.direction,
      status: link.connection?.connectionState === 'connected'
        ? ('connected' as LinkStatus)
        : link.connection
          ? ('connecting' as LinkStatus)
          : ('ringing' as LinkStatus),
      microphoneEnabled: link.microphoneEnabled,
      cameraEnabled: link.cameraEnabled,
      screenSharing: link.screenSharing,
      videoAvailable: link.videoAvailable,
      volume: 100,
      connectionQuality: 'unknown',
    }));
  }, []);

  const syncLinks = useCallback(() => {
    const active = callRef.current;
    if (!active) return;
    const links = snapshotLinks();
    const peer = links[0]?.user ?? active.peer;
    const next: ActiveCall = {
      ...active,
      links,
      peer,
      mode: callModeForState(active.cameraEnabled, active.screenSharing, [...linksRef.current.values()]),
    };
    callRef.current = next;
    setCall(next);
  }, [snapshotLinks]);

  const patchCall = useCallback((patch: Partial<ActiveCall>) => {
    const current = callRef.current;
    if (!current) return;
    updateCall({ ...current, ...patch });
  }, [updateCall]);

  const patchMatchingCall = useCallback((
    callId: string,
    conversationId: string,
    patch: Partial<ActiveCall>,
  ) => {
    const current = callRef.current;
    if (!current || current.callId !== callId || current.conversationId !== conversationId) return;
    updateCall({ ...current, ...patch });
  }, [updateCall]);

  const isCurrentOperation = useCallback((
    callId: string,
    conversationId: string,
    operation: number,
  ): boolean => {
    const current = callRef.current;
    return Boolean(
      current
      && current.callId === callId
      && current.conversationId === conversationId
      && operationRef.current === operation,
    );
  }, []);

  const attachStreams = useCallback(() => {
    if (localVideoElementRef.current) localVideoElementRef.current.srcObject = localStreamRef.current;
    const primary = [...linksRef.current.values()][0];
    if (primaryRemoteElementRef.current) primaryRemoteElementRef.current.srcObject = primary?.stream ?? null;
  }, []);

  const applyRemoteVolume = useCallback((value: number) => {
    const normalized = clampRemoteVolume(value);
    if (remoteGainRef.current) remoteGainRef.current.gain.value = normalized / 100;
    if (primaryRemoteElementRef.current) {
      primaryRemoteElementRef.current.volume = Math.min(1, normalized / 100);
      primaryRemoteElementRef.current.muted = Boolean(
        [...linksRef.current.values()][0]?.audioSource,
      );
    }
  }, []);

  const applyOutputDevice = useCallback(async (speakerId: string) => {
    if (!speakerId) return;
    const context = audioContextRef.current;
    if (context?.setSinkId) {
      await context.setSinkId(speakerId);
      return;
    }
    const element = primaryRemoteElementRef.current;
    if (element?.setSinkId) await element.setSinkId(speakerId);
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume();
      return;
    }
    const Constructor = audioContextConstructor();
    if (!Constructor) return;
    try {
      const context = new Constructor() as AudioContextWithSink;
      const gain = context.createGain();
      gain.connect(context.destination);
      audioContextRef.current = context;
      remoteGainRef.current = gain;
      applyRemoteVolume(callRef.current?.remoteVolume ?? 100);
      if (settingsRef.current.speakerId) void applyOutputDevice(settingsRef.current.speakerId);
      if (context.state === 'suspended') void context.resume();
    } catch {
      // Direct element audio remains available when Web Audio cannot be initialized.
    }
  }, [applyOutputDevice, applyRemoteVolume]);

  const connectRemoteAudio = useCallback((link: InternalLink) => {
    if (link.audioSource) return;
    ensureAudioContext();
    const context = audioContextRef.current;
    const gain = remoteGainRef.current;
    if (!context || !gain || link.stream.getAudioTracks().length === 0) return;
    try {
      const source = context.createMediaStreamSource(link.stream);
      source.connect(gain);
      link.audioSource = source;
      const active = callRef.current;
      const normalized = clampRemoteVolume(active?.remoteVolume ?? 100);
      if (link.videoElement) {
        link.videoElement.volume = Math.min(1, normalized / 100);
        link.videoElement.muted = link !== [...linksRef.current.values()][0];
      }
    } catch {
      if (link.videoElement) link.videoElement.muted = false;
    }
  }, [ensureAudioContext]);

  const setLocalVideoRef = useCallback((element: HTMLVideoElement | null) => {
    localVideoElementRef.current = element;
    if (element) element.srcObject = localStreamRef.current;
  }, []);

  const setRemoteVideoRef = useCallback((element: HTMLVideoElement | null) => {
    primaryRemoteElementRef.current = element;
    const primary = [...linksRef.current.values()][0];
    if (!element) return;
    element.srcObject = primary?.stream ?? null;
    applyRemoteVolume(callRef.current?.remoteVolume ?? 100);
    if (settingsRef.current.speakerId) void applyOutputDevice(settingsRef.current.speakerId);
  }, [applyOutputDevice, applyRemoteVolume]);

  const remoteVideoRefFor = useCallback((userId: string) => {
    return (element: HTMLVideoElement | null) => {
      const link = linksRef.current.get(userId);
      if (!link) return;
      link.videoElement = element;
      if (!element) return;
      element.srcObject = link.stream;
      const primary = [...linksRef.current.values()][0];
      const isPrimary = primary?.userId === userId;
      element.muted = !isPrimary && Boolean(link.audioSource);
      const normalized = clampRemoteVolume(callRef.current?.remoteVolume ?? 100);
      element.volume = Math.min(1, normalized / 100);
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await enumerateCallDevices());
    } catch {
      setDevices(EMPTY_CALL_DEVICES);
    }
  }, []);

  const clearOutgoingTimeout = useCallback(() => {
    if (outgoingTimeoutRef.current !== null) window.clearTimeout(outgoingTimeoutRef.current);
    outgoingTimeoutRef.current = null;
  }, []);

  const sendLocalMediaState = useCallback(() => {
    const active = callRef.current;
    if (!active) return;
    const packet: MediaStatePacket = {
      type: 'media-state',
      microphoneEnabled: active.microphoneEnabled,
      cameraEnabled: active.cameraEnabled,
      screenSharing: active.screenSharing,
    };
    for (const link of linksRef.current.values()) {
      if (link.channel?.readyState === 'open') link.channel.send(JSON.stringify(packet));
    }
  }, []);

  const handleRemoteMediaState = useCallback((userId: string, packet: MediaStatePacket) => {
    const link = linksRef.current.get(userId);
    if (!link) return;
    link.microphoneEnabled = packet.microphoneEnabled;
    link.cameraEnabled = packet.cameraEnabled;
    link.screenSharing = packet.screenSharing;
    // Живая видеодорожка тоже считается: если пакет о состоянии не дошёл,
    // картинку всё равно надо показать.
    const hasVideo = link.stream.getVideoTracks().some(
      (track) => track.readyState === 'live' && !track.muted,
    );
    link.videoAvailable = packet.cameraEnabled || packet.screenSharing || hasVideo;
    syncLinks();
  }, [syncLinks]);

  const configureDataChannel = useCallback((link: InternalLink, channel: RTCDataChannel) => {
    if (link.channel && link.channel !== channel) {
      link.channel.onopen = null;
      link.channel.onmessage = null;
      link.channel.onclose = null;
      link.channel.close();
    }
    link.channel = channel;
    channel.onopen = sendLocalMediaState;
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data.length > 4_096) return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isMediaStatePacket(parsed)) handleRemoteMediaState(link.userId, parsed);
      } catch {
        // Ignore malformed peer metadata without affecting the media connection.
      }
    };
    channel.onclose = () => {
      if (link.channel === channel) link.channel = null;
    };
  }, [handleRemoteMediaState, sendLocalMediaState]);

  const updateLinkAvailability = useCallback((link: InternalLink) => {
    const hasVideo = link.stream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
    link.videoAvailable = link.cameraEnabled || link.screenSharing || hasVideo;
    syncLinks();
  }, [syncLinks]);

  const closeLink = useCallback((link: InternalLink) => {
    const channel = link.channel;
    link.channel = null;
    if (channel) {
      channel.onopen = null;
      channel.onmessage = null;
      channel.onclose = null;
      channel.close();
    }
    const connection = link.connection;
    link.connection = null;
    link.audioSender = null;
    link.videoSender = null;
    if (connection) {
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.onconnectionstatechange = null;
      connection.ondatachannel = null;
      connection.close();
    }
    if (link.audioSource) link.audioSource.disconnect();
    link.audioSource = null;
    link.videoElement = null;
    for (const track of link.stream.getTracks()) stopTrack(track);
  }, []);

const cleanupLinks = useCallback(() => {
    for (const link of linksRef.current.values()) {
      closeLink(link);
    }
    linksRef.current.clear();
  }, [closeLink]);

  const cleanup = useCallback((notifyPeer: boolean, expectedCallId?: string) => {
    const active = callRef.current;
    if (expectedCallId && active?.callId !== expectedCallId) return;

    operationRef.current += 1;
    clearOutgoingTimeout();
    updateCall(null);
    incomingOfferRef.current = null;
    invitePayloadRef.current = null;
    pendingCandidatesRef.current.clear();
    reportedModeRef.current = null;

    if (notifyPeer && active && socketRef.current?.connected) {
      socketRef.current.emit('call:end', {
        callId: active.callId,
        conversationId: active.conversationId,
      });
    }

    cleanupLinks();

    stopTrack(screenTrackRef.current);
    stopTrack(cameraTrackRef.current);
    stopTrack(microphoneTrackRef.current);
    for (const track of localStreamRef.current?.getTracks() ?? []) stopTrack(track);
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    microphoneTrackRef.current = null;
    localStreamRef.current = null;

    remoteGainRef.current?.disconnect();
    remoteGainRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();

    if (primaryRemoteElementRef.current) primaryRemoteElementRef.current.muted = false;
    attachStreams();
  }, [attachStreams, cleanupLinks, clearOutgoingTimeout, updateCall]);

  const scheduleOutgoingTimeout = useCallback((callId: string, conversationId: string) => {
    clearOutgoingTimeout();
    outgoingTimeoutRef.current = window.setTimeout(() => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== callId
        || active.conversationId !== conversationId
        || active.status !== 'outgoing'
      ) {
        return;
      }
      setError('Собеседник не ответил на звонок.');
      cleanup(true, callId);
    }, OUTGOING_TIMEOUT_MS);
  }, [cleanup, clearOutgoingTimeout]);

  const ensureMedia = useCallback(async (
    includeCamera: boolean,
    currentSettings: CallSettings,
  ): Promise<MediaStream> => {
    if (!mediaIsAvailable()) throw new Error(secureContextError());
    return navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(currentSettings),
      video: includeCamera ? videoConstraints(currentSettings) : false,
    });
  }, []);

  const acquireMicrophoneTrack = useCallback(async (currentSettings: CallSettings) => {
    if (!mediaIsAvailable()) throw new Error(secureContextError());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(currentSettings),
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('Браузер не предоставил аудиодорожку микрофона.');
    return track;
  }, []);

  const acquireCameraTrack = useCallback(async (currentSettings: CallSettings) => {
    if (!mediaIsAvailable()) throw new Error(secureContextError());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints(currentSettings),
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Браузер не предоставил видеодорожку камеры.');
    return track;
  }, []);

  const replacePreviewVideo = useCallback((track: MediaStreamTrack | null) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const existing of stream.getVideoTracks()) stream.removeTrack(existing);
    if (track) stream.addTrack(track);
    attachStreams();
  }, [attachStreams]);

  const installLocalStream = useCallback((stream: MediaStream, active: ActiveCall) => {
    const microphone = stream.getAudioTracks()[0] ?? null;
    const camera = stream.getVideoTracks()[0] ?? null;
    if (microphone) microphone.enabled = active.microphoneEnabled;
    if (camera) camera.enabled = active.cameraEnabled;
    microphoneTrackRef.current = microphone;
    cameraTrackRef.current = camera;
    localStreamRef.current = stream;
    attachStreams();
  }, [attachStreams]);

  const pruneCandidateBuffers = useCallback(() => {
    const cutoff = Date.now() - CANDIDATE_TTL_MS;
    for (const [userId, entry] of pendingCandidatesRef.current) {
      if (entry.updatedAt < cutoff) pendingCandidatesRef.current.delete(userId);
    }
    while (pendingCandidatesRef.current.size >= MAX_BUFFERED_CALLS) {
      const oldestUserId = pendingCandidatesRef.current.keys().next().value as string | undefined;
      if (!oldestUserId) break;
      pendingCandidatesRef.current.delete(oldestUserId);
    }
  }, []);

  const bufferCandidate = useCallback((payload: DirectedIcePayload) => {
    pruneCandidateBuffers();
    const existing = pendingCandidatesRef.current.get(payload.fromUserId);
    if (existing && (existing.callId !== payload.callId || existing.conversationId !== payload.conversationId)) return;

    const entry = existing ?? {
      userId: payload.fromUserId,
      callId: payload.callId,
      conversationId: payload.conversationId,
      candidates: [],
      updatedAt: Date.now(),
    };
    if (entry.candidates.length >= MAX_CANDIDATES_PER_LINK) entry.candidates.shift();
    entry.candidates.push(payload.candidate);
    entry.updatedAt = Date.now();
    pendingCandidatesRef.current.set(payload.fromUserId, entry);
  }, [pruneCandidateBuffers]);

  const flushCandidates = useCallback(async (userId: string) => {
    const link = linksRef.current.get(userId);
    if (!link?.connection?.remoteDescription) return;

    const entry = pendingCandidatesRef.current.get(userId);
    pendingCandidatesRef.current.delete(userId);
    if (!entry) return;

    let failed = false;
    for (const candidate of entry.candidates) {
      try {
        await link.connection.addIceCandidate(candidate);
      } catch {
        failed = true;
      }
    }
    if (failed && linksRef.current.has(userId)) {
      setError('Не удалось использовать один из сетевых маршрутов. Пробуем другие…');
    }
  }, []);

  /**
   * Повторная договорённость внутри уже идущего звонка. Нужна в двух случаях:
   * появился новый видеопоток (демонстрация экрана) и связь развалилась —
   * тогда вместе с restartIce это поднимает звонок заново.
   */
  const renegotiateLink = useCallback(async (link: InternalLink) => {
    const active = callRef.current;
    const connection = link.connection;
    if (!active || !connection || !socketRef.current?.connected) return false;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const localDescription = connection.localDescription;
      if (!localDescription) return false;
      socketRef.current.emit('call:renegotiate', {
        callId: active.callId,
        conversationId: active.conversationId,
        toUserId: link.userId,
        offer: { type: 'offer', sdp: localDescription.sdp },
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Перезапуск ICE: два шанса, прежде чем признать звонок потерянным. */
  const restartIceFor = useCallback(async (link: InternalLink) => {
    const attempts = iceRestartRef.current.get(link.userId) ?? 0;
    if (attempts >= 2) return false;
    iceRestartRef.current.set(link.userId, attempts + 1);
    const connection = link.connection;
    if (!connection) return false;
    if (typeof connection.restartIce === 'function') connection.restartIce();
    return renegotiateLink(link);
  }, [renegotiateLink]);

  const createPeerConnection = useCallback((
    callId: string,
    conversationId: string,
    link: InternalLink,
    offerer: boolean,
  ): RTCPeerConnection => {
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    link.connection = connection;

    const localStream = localStreamRef.current;
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) link.audioSender = connection.addTrack(audioTrack, localStream);
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) link.videoSender = connection.addTrack(videoTrack, localStream);
      else link.videoSender = connection.addTransceiver('video', { direction: 'sendrecv' }).sender;
    }

    const remoteStream = new MediaStream();
    link.stream = remoteStream;
    if (offerer) configureDataChannel(link, connection.createDataChannel(MEDIA_CHANNEL_NAME, { ordered: true }));
    connection.ondatachannel = (event) => {
      if (event.channel.label === MEDIA_CHANNEL_NAME) configureDataChannel(link, event.channel);
    };
    connection.ontrack = (event) => {
      if (linksRef.current.get(link.userId) !== link) return;
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      if (event.track.kind === 'audio') connectRemoteAudio(link);
      if (event.track.kind === 'video') {
        const updateRemoteVideo = () => updateLinkAvailability(link);
        event.track.onmute = updateRemoteVideo;
        event.track.onunmute = updateRemoteVideo;
        event.track.onended = updateRemoteVideo;
        updateRemoteVideo();
      }
      attachStreams();
    };
    connection.onicecandidate = (event) => {
      const active = callRef.current;
      if (
        !event.candidate
        || !active
        || active.callId !== callId
        || active.conversationId !== conversationId
        || !socketRef.current?.connected
      ) {
        return;
      }
      socketRef.current.emit('call:ice', {
        callId,
        conversationId,
        toUserId: link.userId,
        candidate: event.candidate.toJSON(),
      });
    };
    connection.onconnectionstatechange = () => {
      const active = callRef.current;
      if (
        linksRef.current.get(link.userId) !== link
        || !active
        || active.callId !== callId
        || active.conversationId !== conversationId
      ) {
        return;
      }
      if (connection.connectionState === 'connected') {
        clearOutgoingTimeout();
        setError('');
        const allConnected = [...linksRef.current.values()].every(
          (candidate) => candidate.connection?.connectionState === 'connected',
        );
        patchMatchingCall(callId, conversationId, {
          status: allConnected ? 'active' : 'connecting',
          startedAt: active.startedAt ?? Date.now(),
        });
        sendLocalMediaState();
      } else if (connection.connectionState === 'failed') {
        // Сначала пробуем поднять соединение заново: часто помогает, когда
        // сетевой маршрут появился не сразу.
        void restartIceFor(link).then((restarted) => {
          if (restarted && linksRef.current.get(link.userId) === link) {
            setError('Связь прервалась — перезапускаем соединение…');
            return;
          }
          if (linksRef.current.size === 1) {
            setError('Звонок завершён из-за потери соединения.');
            cleanup(true, callId);
          } else {
            setError('Не удалось установить связь с одним из участников.');
            const linkEntry = linksRef.current.get(link.userId);
            if (linkEntry) {
              linkEntry.connection = null;
              linkEntry.channel = null;
              for (const track of linkEntry.stream.getTracks()) stopTrack(track);
              linksRef.current.delete(link.userId);
              syncLinks();
            }
          }
        });
      } else if (connection.connectionState === 'disconnected') {
        // Короткая потеря сети: ждём, вдруг всё восстановится само.
        window.setTimeout(() => {
          if (linksRef.current.get(link.userId) !== link) return;
          const state = connection.connectionState;
          if (state === 'connected' || state === 'closed') return;
          void restartIceFor(link).then((restarted) => {
            if (restarted && linksRef.current.get(link.userId) === link) {
              setError('Связь прервалась — перезапускаем соединение…');
            }
          });
        }, 4_000);
      }
    };
    return connection;
  }, [
    attachStreams,
    cleanup,
    clearOutgoingTimeout,
    configureDataChannel,
    connectRemoteAudio,
    patchMatchingCall,
    restartIceFor,
    sendLocalMediaState,
    syncLinks,
    updateLinkAvailability,
  ]);

  const createLinkEntry = useCallback((
    user: User,
    direction: LinkDirection,
    callId: string,
    conversationId: string,
    offerer: boolean,
  ): InternalLink => {
    const link: InternalLink = {
      callId,
      conversationId,
      userId: user.id,
      user,
      direction,
      connection: null,
      stream: new MediaStream(),
      channel: null,
      audioSender: null,
      videoSender: null,
      videoElement: null,
      audioSource: null,
      microphoneEnabled: true,
      cameraEnabled: false,
      screenSharing: false,
      videoAvailable: false,
    };
    linksRef.current.set(user.id, link);
    createPeerConnection(callId, conversationId, link, offerer);
    syncLinks();
    return link;
  }, [createPeerConnection, syncLinks]);

  const startCall = useCallback(async (
    conversationId: string,
    peer: User,
    mode: CallMode,
  ) => {
    if (callRef.current) return;
    if (!mediaIsAvailable()) {
      setError(secureContextError());
      return;
    }
    if (!socketRef.current?.connected) {
      setError('Нет realtime-соединения с сервером. Повторите через несколько секунд.');
      return;
    }

    setError('');
    ensureAudioContext();
    const currentSettings = settingsRef.current;
    const cameraEnabled = mode === 'video' && currentSettings.autoEnableCamera;
    const next: ActiveCall = {
      callId: createCallId(),
      conversationId,
      initialMode: mode,
      mode,
      direction: 'outgoing',
      status: 'outgoing',
      peer,
      links: [],
      invited: false,
      microphoneEnabled: true,
      cameraEnabled,
      screenSharing: false,
      remoteVolume: loadConversationVolume(conversationId),
      connectionQuality: 'unknown',
      mediaReady: false,
      startedAt: null,
    };
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    updateCall(next);
    applyRemoteVolume(next.remoteVolume);

    try {
      const stream = await ensureMedia(cameraEnabled, currentSettings);
      if (!isCurrentOperation(next.callId, conversationId, operation)) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }

      const current = callRef.current;
      if (!current) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }
      installLocalStream(stream, current);
      patchMatchingCall(next.callId, conversationId, { mediaReady: true });
      void refreshDevices();
      const link = createLinkEntry(peer, 'outgoing', next.callId, conversationId, true);
      const connection = link.connection;
      if (!connection) throw new Error('Не удалось создать медиасоединение.');
      const offer = await connection.createOffer();
      if (!isCurrentOperation(next.callId, conversationId, operation)) return;
      await connection.setLocalDescription(offer);
      if (!isCurrentOperation(next.callId, conversationId, operation)) return;

      const localDescription = connection.localDescription;
      if (!localDescription || !socketRef.current?.connected) {
        throw new Error('Realtime-соединение потеряно до начала звонка.');
      }
      socketRef.current.emit('call:offer', {
        callId: next.callId,
        conversationId,
        mode,
        offer: { type: 'offer', sdp: localDescription.sdp },
      });
      scheduleOutgoingTimeout(next.callId, conversationId);
    } catch (reason) {
      if (!isCurrentOperation(next.callId, conversationId, operation)) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось начать звонок.');
      cleanup(false, next.callId);
    }
  }, [
    applyRemoteVolume,
    cleanup,
    createLinkEntry,
    ensureAudioContext,
    ensureMedia,
    installLocalStream,
    isCurrentOperation,
    patchMatchingCall,
    refreshDevices,
    scheduleOutgoingTimeout,
    updateCall,
  ]);

  const acceptCall = useCallback(async () => {
    const active = callRef.current;
    const incoming = incomingOfferRef.current;
    if (
      !active
      || active.status !== 'incoming'
      || !incoming
      || incoming.callId !== active.callId
      || incoming.conversationId !== active.conversationId
    ) {
      return;
    }

    setError('');
    ensureAudioContext();
    patchMatchingCall(active.callId, active.conversationId, { status: 'connecting' });
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    try {
      const stream = await ensureMedia(active.cameraEnabled, settingsRef.current);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }

      const current = callRef.current;
      if (!current) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }
      installLocalStream(stream, current);
      patchMatchingCall(active.callId, active.conversationId, { mediaReady: true });
      void refreshDevices();
      const link = createLinkEntry(incoming.fromUser, 'incoming', active.callId, active.conversationId, false);
      const connection = link.connection;
      if (!connection) throw new Error('Не удалось создать медиасоединение.');
      await connection.setRemoteDescription(incoming.offer);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      await flushCandidates(incoming.fromUser.id);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      const answer = await connection.createAnswer();
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      await connection.setLocalDescription(answer);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;

      const localDescription = connection.localDescription;
      if (!localDescription || !socketRef.current?.connected) {
        throw new Error('Realtime-соединение потеряно при принятии звонка.');
      }
      socketRef.current.emit('call:answer', {
        callId: active.callId,
        conversationId: active.conversationId,
        answer: { type: 'answer', sdp: localDescription.sdp },
      });
    } catch (reason) {
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось принять звонок.');
      cleanup(true, active.callId);
    }
  }, [
    cleanup,
    createLinkEntry,
    ensureAudioContext,
    ensureMedia,
    flushCandidates,
    installLocalStream,
    isCurrentOperation,
    patchMatchingCall,
    refreshDevices,
  ]);

  const offerToParticipants = useCallback(async (
    participants: Array<{ id: string; displayName: string; username?: string | null }>,
    callId: string,
    conversationId: string,
  ) => {
    const operation = operationRef.current;
    for (const participant of participants) {
      if (participant.id === currentUserRef.current?.id) continue;
      const user: User = { ...participant, id: participant.id, displayName: participant.displayName };
      if (!isCurrentOperation(callId, conversationId, operation)) return;
      const link = createLinkEntry(user, 'outgoing', callId, conversationId, true);
      const connection = link.connection;
      if (!connection) continue;
      const offer = await connection.createOffer();
      if (!isCurrentOperation(callId, conversationId, operation)) return;
      await connection.setLocalDescription(offer);
      if (!isCurrentOperation(callId, conversationId, operation)) return;
      const localDescription = connection.localDescription;
      if (!localDescription || !socketRef.current?.connected) continue;
      socketRef.current.emit('call:join-offer', {
        callId,
        conversationId,
        toUserId: user.id,
        offer: { type: 'offer', sdp: localDescription.sdp },
      });
    }
  }, [createLinkEntry, isCurrentOperation]);

  const acceptInvite = useCallback(async () => {
    const active = callRef.current;
    const invite = invitePayloadRef.current;
    if (
      !active
      || active.status !== 'incoming'
      || !invite
      || invite.callId !== active.callId
      || invite.conversationId !== active.conversationId
    ) {
      return;
    }
    setError('');
    ensureAudioContext();
    invitePayloadRef.current = null;
    patchMatchingCall(active.callId, active.conversationId, { status: 'connecting' });
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    try {
      const stream = await ensureMedia(active.cameraEnabled, settingsRef.current);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }
      const current = callRef.current;
      if (!current) {
        for (const track of stream.getTracks()) stopTrack(track);
        return;
      }
      installLocalStream(stream, current);
      patchMatchingCall(active.callId, active.conversationId, { mediaReady: true });
      void refreshDevices();

      if (!socketRef.current?.connected) {
        throw new Error('Realtime-соединение потеряно при входе в звонок.');
      }
      socketRef.current.emit('call:join', {
        callId: active.callId,
        conversationId: active.conversationId,
      });

      const participants = [invite.fromUser, ...invite.participants.map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        username: participant.username ?? null,
      }))];
      await offerToParticipants(participants, active.callId, active.conversationId);
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      const allConnected = [...linksRef.current.values()].every(
        (link) => link.connection?.connectionState === 'connected',
      );
      patchMatchingCall(active.callId, active.conversationId, {
        status: allConnected ? 'active' : 'connecting',
        startedAt: allConnected ? Date.now() : null,
      });
    } catch (reason) {
      if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось войти в звонок.');
      cleanup(true, active.callId);
    }
  }, [
    cleanup,
    ensureAudioContext,
    ensureMedia,
    installLocalStream,
    isCurrentOperation,
    offerToParticipants,
    patchMatchingCall,
    refreshDevices,
  ]);

  const declineInvite = useCallback(() => {
    const active = callRef.current;
    if (active && socketRef.current?.connected) {
      socketRef.current.emit('call:decline', {
        callId: active.callId,
        conversationId: active.conversationId,
      });
    }
    cleanup(false);
  }, [cleanup]);

  const inviteParticipant = useCallback((userId: string) => {
    const active = callRef.current;
    if (!active || active.status !== 'active' || !socketRef.current?.connected) {
      setError('Приглашать участников можно во время активного звонка.');
      return;
    }
    socketRef.current.emit('call:invite', {
      callId: active.callId,
      conversationId: active.conversationId,
      userId,
    });
  }, []);

  const toggleMicrophone = useCallback(() => {
    const active = callRef.current;
    if (!active) return;
    const enabled = !active.microphoneEnabled;
    if (microphoneTrackRef.current) microphoneTrackRef.current.enabled = enabled;
    patchCall({ microphoneEnabled: enabled });
    sendLocalMediaState();
  }, [patchCall, sendLocalMediaState]);

  const toggleCamera = useCallback(async () => {
    const active = callRef.current;
    if (!active || !active.mediaReady) return;
    const enabled = !active.cameraEnabled;

    if (active.screenSharing) {
      const next = { ...active, cameraEnabled: enabled };
      next.mode = callModeForState(enabled, next.screenSharing, [...linksRef.current.values()]);
      updateCall(next);
      sendLocalMediaState();
      return;
    }

    try {
      if (enabled) {
        const track = await acquireCameraTrack(settingsRef.current);
        const current = callRef.current;
        if (!current || current.callId !== active.callId || current.screenSharing) {
          stopTrack(track);
          return;
        }
        for (const link of linksRef.current.values()) {
          await link.videoSender?.replaceTrack(track);
        }
        stopTrack(cameraTrackRef.current);
        cameraTrackRef.current = track;
        replacePreviewVideo(track);
        const next = { ...current, cameraEnabled: true };
        next.mode = callModeForState(true, next.screenSharing, [...linksRef.current.values()]);
        updateCall(next);
        void refreshDevices();
      } else {
        for (const link of linksRef.current.values()) {
          await link.videoSender?.replaceTrack(null);
        }
        const camera = cameraTrackRef.current;
        cameraTrackRef.current = null;
        replacePreviewVideo(null);
        stopTrack(camera);
        const current = callRef.current;
        if (!current || current.callId !== active.callId) return;
        const next = { ...current, cameraEnabled: false };
        next.mode = callModeForState(false, next.screenSharing, [...linksRef.current.values()]);
        updateCall(next);
      }
      sendLocalMediaState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось переключить камеру.');
    }
  }, [
    acquireCameraTrack,
    refreshDevices,
    replacePreviewVideo,
    sendLocalMediaState,
    updateCall,
  ]);

  const stopScreenShare = useCallback(async () => {
    const active = callRef.current;
    const screenTrack = screenTrackRef.current;
    if (!active || !screenTrack) return;
    screenTrackRef.current = null;
    screenTrack.onended = null;

    let camera: MediaStreamTrack | null = null;
    try {
      if (active.cameraEnabled) camera = await acquireCameraTrack(settingsRef.current);
      const current = callRef.current;
      if (!current || current.callId !== active.callId) {
        stopTrack(camera);
        stopTrack(screenTrack);
        return;
      }
      for (const link of linksRef.current.values()) {
        await link.videoSender?.replaceTrack(camera);
      }
      cameraTrackRef.current = camera;
      replacePreviewVideo(camera);
      stopTrack(screenTrack);
      const next = { ...current, screenSharing: false, cameraEnabled: Boolean(camera) };
      next.mode = callModeForState(Boolean(camera), false, [...linksRef.current.values()]);
      updateCall(next);
      sendLocalMediaState();
      for (const link of linksRef.current.values()) await renegotiateLink(link);
    } catch (reason) {
      for (const link of linksRef.current.values()) {
        await link.videoSender?.replaceTrack(null).catch(() => undefined);
      }
      stopTrack(camera);
      stopTrack(screenTrack);
      cameraTrackRef.current = null;
      replacePreviewVideo(null);
      const current = callRef.current;
      if (current?.callId === active.callId) {
        const next = { ...current, screenSharing: false, cameraEnabled: false };
        next.mode = callModeForState(false, false, [...linksRef.current.values()]);
        updateCall(next);
        sendLocalMediaState();
      }
      setError(reason instanceof Error ? reason.message : 'Не удалось вернуться к камере.');
    }
  }, [acquireCameraTrack, renegotiateLink, replacePreviewVideo, sendLocalMediaState, updateCall]);

  const toggleScreenShare = useCallback(async () => {
    const active = callRef.current;
    if (!active || !active.mediaReady) return;
    if (active.screenSharing) {
      await stopScreenShare();
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      setError('Демонстрация экрана недоступна. Откройте Yargram по HTTPS в современном браузере.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      const track = displayStream.getVideoTracks()[0];
      if (!track) throw new Error('Браузер не предоставил изображение экрана.');
      const current = callRef.current;
      if (!current || current.callId !== active.callId) {
        stopTrack(track);
        return;
      }

      // Экран важнее камеры: текст и интерфейс должны оставаться читаемыми.
      if ('contentHint' in track) track.contentHint = 'detail';

      for (const link of linksRef.current.values()) {
        let sender = link.videoSender;
        // В аудио-звонке видеодорожки могло не быть — добавляем её перед подменой.
        if (!sender && link.connection) {
          sender = link.connection.addTransceiver('video', { direction: 'sendrecv' }).sender;
          link.videoSender = sender;
        }
        if (sender) await sender.replaceTrack(track);
      }
      const camera = cameraTrackRef.current;
      cameraTrackRef.current = null;
      stopTrack(camera);
      screenTrackRef.current = track;
      replacePreviewVideo(track);
      track.onended = () => void stopScreenShare();
      const next = { ...current, screenSharing: true, mode: 'video' as CallMode };
      updateCall(next);
      sendLocalMediaState();
      // Собеседник должен получить новый SDP, иначе экран останется невидимым.
      for (const link of linksRef.current.values()) await renegotiateLink(link);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') return;
      setError(reason instanceof Error ? reason.message : 'Не удалось начать демонстрацию экрана.');
    }
  }, [renegotiateLink, replacePreviewVideo, sendLocalMediaState, stopScreenShare, updateCall]);

  const setRemoteVolume = useCallback((value: number) => {
    const active = callRef.current;
    if (!active) return;
    const normalized = clampRemoteVolume(value);
    saveConversationVolume(active.conversationId, normalized);
    patchCall({ remoteVolume: normalized });
    applyRemoteVolume(normalized);
  }, [applyRemoteVolume, patchCall]);

  const updateSettings = useCallback(async (patch: Partial<CallSettings>) => {
    const previous = settingsRef.current;
    const next: CallSettings = { ...previous, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveCallSettings(next);

    try {
      if (patch.speakerId !== undefined) await applyOutputDevice(next.speakerId);
      const active = callRef.current;
      if (!active?.mediaReady) return;

      const microphoneChanged = patch.microphoneId !== undefined
        || patch.noiseSuppression !== undefined
        || patch.echoCancellation !== undefined;
      if (microphoneChanged) {
        const replacement = await acquireMicrophoneTrack(next);
        const current = callRef.current;
        if (!current || current.callId !== active.callId) {
          stopTrack(replacement);
          return;
        }
        replacement.enabled = current.microphoneEnabled;
        for (const link of linksRef.current.values()) {
          await link.audioSender?.replaceTrack(replacement);
        }
        const old = microphoneTrackRef.current;
        microphoneTrackRef.current = replacement;
        const stream = localStreamRef.current;
        if (stream) {
          for (const track of stream.getAudioTracks()) stream.removeTrack(track);
          stream.addTrack(replacement);
        }
        stopTrack(old);
        attachStreams();
      }

      const cameraChanged = patch.cameraId !== undefined || patch.videoQuality !== undefined;
      const current = callRef.current;
      if (cameraChanged && current?.cameraEnabled && !current.screenSharing) {
        const replacement = await acquireCameraTrack(next);
        const latest = callRef.current;
        if (!latest || latest.callId !== active.callId || latest.screenSharing) {
          stopTrack(replacement);
          return;
        }
        for (const link of linksRef.current.values()) {
          await link.videoSender?.replaceTrack(replacement);
        }
        const old = cameraTrackRef.current;
        cameraTrackRef.current = replacement;
        replacePreviewVideo(replacement);
        stopTrack(old);
      }
      void refreshDevices();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось применить настройки звонка.');
    }
  }, [
    acquireCameraTrack,
    acquireMicrophoneTrack,
    applyOutputDevice,
    attachStreams,
    refreshDevices,
    replacePreviewVideo,
  ]);

  const currentUserRef = useRef<User | null>(null);

  const setCurrentUser = useCallback((user: User) => {
    currentUserRef.current = user;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return undefined;
    const onDeviceChange = () => void refreshDevices();
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [refreshDevices]);

  const effectCallId = call?.callId;
  const effectConversationId = call?.conversationId;
  const effectCallMode = call?.mode;
  const effectCallStatus = call?.status;

  useEffect(() => {
    if (!effectCallId || (effectCallStatus !== 'incoming' && effectCallStatus !== 'outgoing')) return undefined;
    playSound('call');
    const interval = window.setInterval(() => playSound('call'), 3_500);
    return () => window.clearInterval(interval);
  }, [effectCallId, effectCallStatus]);

  useEffect(() => {
    if (!effectCallId) {
      reportedModeRef.current = null;
      return;
    }
    if (
      effectCallStatus !== 'active'
      || !effectConversationId
      || !effectCallMode
      || !socketRef.current?.connected
    ) return;
    const reported = reportedModeRef.current;
    if (reported?.callId === effectCallId && reported.mode === effectCallMode) return;
    reportedModeRef.current = { callId: effectCallId, mode: effectCallMode };
    socketRef.current.emit('call:mode', {
      callId: effectCallId,
      conversationId: effectConversationId,
      mode: effectCallMode,
    });
  }, [effectCallId, effectCallMode, effectCallStatus, effectConversationId]);

  useEffect(() => {
    if (!effectCallId || !effectConversationId || effectCallStatus !== 'active') return undefined;
    let cancelled = false;
    const updateQuality = async () => {
      const primary = [...linksRef.current.values()][0];
      const connection = primary?.connection;
      if (!connection || connection.connectionState !== 'connected') return;
      try {
        const quality = connectionQualityFromStats(await connection.getStats());
        if (!cancelled) patchMatchingCall(effectCallId, effectConversationId, { connectionQuality: quality });
      } catch {
        if (!cancelled) patchMatchingCall(effectCallId, effectConversationId, { connectionQuality: 'unknown' });
      }
    };
    void updateQuality();
    const interval = window.setInterval(() => void updateQuality(), 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [effectCallId, effectCallStatus, effectConversationId, patchMatchingCall]);

  useEffect(() => {
    socketRef.current = socket;
    if (!socket) {
      if (callRef.current) {
        setError('Realtime-соединение с сервером потеряно. Звонок завершён.');
        cleanup(false);
      }
      return undefined;
    }

    const onIncoming = (payload: IncomingCallPayload) => {
      if (callRef.current) {
        pendingCandidatesRef.current.delete(payload.callId);
        if (socket.connected) {
          socket.emit('call:end', {
            callId: payload.callId,
            conversationId: payload.conversationId,
          });
        }
        return;
      }

      operationRef.current += 1;
      setError('');
      incomingOfferRef.current = payload;
      const cameraEnabled = payload.mode === 'video' && settingsRef.current.autoEnableCamera;
      updateCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        initialMode: payload.mode,
        mode: payload.mode,
        direction: 'incoming',
        status: 'incoming',
        peer: payload.fromUser,
        links: [],
        invited: false,
        microphoneEnabled: true,
        cameraEnabled,
        screenSharing: false,
        remoteVolume: loadConversationVolume(payload.conversationId),
        connectionQuality: 'unknown',
        mediaReady: false,
        startedAt: null,
      });
    };

    const onInviteIncoming = (payload: InviteIncomingPayload) => {
      if (callRef.current) {
        socket.emit('call:decline', {
          callId: payload.callId,
          conversationId: payload.conversationId,
        });
        return;
      }
      operationRef.current += 1;
      setError('');
      invitePayloadRef.current = payload;
      const cameraEnabled = payload.mode === 'video' && settingsRef.current.autoEnableCamera;
      updateCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        initialMode: payload.mode,
        mode: payload.mode,
        direction: 'incoming',
        status: 'incoming',
        peer: payload.fromUser,
        links: [],
        invited: true,
        microphoneEnabled: true,
        cameraEnabled,
        screenSharing: false,
        remoteVolume: loadConversationVolume(payload.conversationId),
        connectionQuality: 'unknown',
        mediaReady: false,
        startedAt: null,
      });
    };

    const onParticipantJoined = (payload: ParticipantJoinedPayload) => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
      ) {
        return;
      }
      if (linksRef.current.has(payload.user.id)) return;
      const link: InternalLink = {
        callId: payload.callId,
        conversationId: payload.conversationId,
        userId: payload.user.id,
        user: payload.user,
        direction: 'incoming',
        connection: null,
        stream: new MediaStream(),
        channel: null,
        audioSender: null,
        videoSender: null,
        videoElement: null,
        audioSource: null,
        microphoneEnabled: true,
        cameraEnabled: false,
        screenSharing: false,
        videoAvailable: false,
      };
      linksRef.current.set(payload.user.id, link);
      syncLinks();
    };

    const onParticipantLeft = (payload: ParticipantLeftPayload) => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
      ) {
        return;
      }
      const link = linksRef.current.get(payload.userId);
      if (!link) return;
      closeLink(link);
      linksRef.current.delete(payload.userId);
      syncLinks();
    };

    const onJoinOffer = async (payload: JoinOfferPayload) => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
      ) {
        return;
      }
      const existing = linksRef.current.get(payload.fromUserId);
      if (existing?.connection) return;
      const operation = operationRef.current;
      const isNewLink = !existing;
      const link = existing ?? createLinkEntry(
        { id: payload.fromUserId, displayName: 'Участник' },
        'incoming',
        payload.callId,
        payload.conversationId,
        false,
      );
      if (!link) return;
      if (isNewLink) {
        syncLinks();
      } else {
        createPeerConnection(payload.callId, payload.conversationId, link, false);
        syncLinks();
      }
      const connection = link.connection;
      if (!connection) return;
      try {
        await connection.setRemoteDescription(payload.offer);
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        await flushCandidates(payload.fromUserId);
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        const answer = await connection.createAnswer();
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        await connection.setLocalDescription(answer);
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        const localDescription = connection.localDescription;
        if (!localDescription || !socketRef.current?.connected) return;
        socketRef.current.emit('call:join-answer', {
          callId: payload.callId,
          conversationId: payload.conversationId,
          fromUserId: payload.fromUserId,
          answer: { type: 'answer', sdp: localDescription.sdp },
        });
      } catch {
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        setError('Не удалось установить связь с новым участником.');
      }
    };

    const onJoinAnswer = async (payload: JoinAnswerPayload) => {
      const active = callRef.current;
      const link = linksRef.current.get(payload.fromUserId);
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
        || !link?.connection
      ) {
        return;
      }
      const operation = operationRef.current;
      try {
        await link.connection.setRemoteDescription(payload.answer);
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        await flushCandidates(payload.fromUserId);
      } catch {
        if (!isCurrentOperation(payload.callId, payload.conversationId, operation)) return;
        setError('Не удалось установить соединение с участником.');
      }
    };

    const onDirectedIce = async (payload: DirectedIcePayload) => {
      if (!payload?.callId || !payload.conversationId || !payload.fromUserId || !payload.candidate) return;
      const active = callRef.current;
      const link = linksRef.current.get(payload.fromUserId);
      if (!active || active.callId !== payload.callId || active.conversationId !== payload.conversationId) return;
      if (!link?.connection?.remoteDescription) {
        bufferCandidate(payload);
        return;
      }
      try {
        await link.connection.addIceCandidate(payload.candidate);
      } catch {
        if (linksRef.current.has(payload.fromUserId)) {
          setError('Не удалось использовать один из сетевых маршрутов. Пробуем другие…');
        }
      }
    };

    const onAnswered = async (payload: CallAnswerPayload) => {
      const active = callRef.current;
      if (
        !active
        || active.status !== 'outgoing'
        || payload.callId !== active.callId
        || payload.conversationId !== active.conversationId
      ) {
        return;
      }

      const connection = [...linksRef.current.values()][0]?.connection;
      if (!connection) return;
      const operation = operationRef.current;
      clearOutgoingTimeout();
      patchMatchingCall(active.callId, active.conversationId, { status: 'connecting' });
      try {
        await connection.setRemoteDescription(payload.answer);
        if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
        const peerId = [...linksRef.current.values()][0]?.userId;
        if (peerId) await flushCandidates(peerId);
      } catch {
        if (!isCurrentOperation(active.callId, active.conversationId, operation)) return;
        setError('Не удалось установить соединение звонка.');
        cleanup(true, active.callId);
      }
    };

    const onCandidate = async (payload: IcePayload) => {
      if (!payload?.callId || !payload.conversationId || !payload.candidate) return;
      const active = callRef.current;
      const primary = [...linksRef.current.values()][0];
      if (!active || active.callId !== payload.callId || active.conversationId !== payload.conversationId) return;
      if (!primary?.connection?.remoteDescription) {
        bufferCandidate({ ...payload, fromUserId: primary?.userId ?? '' });
        return;
      }
      try {
        await primary.connection.addIceCandidate(payload.candidate);
      } catch {
        if (callRef.current?.callId === payload.callId) {
          setError('Не удалось использовать один из сетевых маршрутов. Пробуем другие…');
        }
      }
    };

    const onRenegotiate = async (payload: RenegotiatePayload) => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
      ) {
        return;
      }
      const link = linksRef.current.get(payload.fromUserId);
      const connection = link?.connection;
      if (!link || !connection) return;
      try {
        await connection.setRemoteDescription(payload.offer);
        await flushCandidates(payload.fromUserId);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        const localDescription = connection.localDescription;
        if (!localDescription || !socketRef.current?.connected) return;
        socketRef.current.emit('call:renegotiate-answer', {
          callId: payload.callId,
          conversationId: payload.conversationId,
          toUserId: payload.fromUserId,
          answer: { type: 'answer', sdp: localDescription.sdp },
        });
      } catch {
        // Повторная договорённость не прошла — звонок продолжается как есть.
      }
    };

    const onRenegotiateAnswer = async (payload: RenegotiateAnswerPayload) => {
      const active = callRef.current;
      const link = linksRef.current.get(payload.fromUserId);
      if (
        !active
        || active.callId !== payload.callId
        || active.conversationId !== payload.conversationId
        || !link?.connection
      ) {
        return;
      }
      try {
        await link.connection.setRemoteDescription(payload.answer);
        await flushCandidates(payload.fromUserId);
      } catch {
        // Оставляем соединение в текущем состоянии.
      }
    };

    const onEnded = (payload: { callId: string; conversationId?: string }) => {
      const active = callRef.current;
      if (
        !active
        || active.callId !== payload.callId
        || (payload.conversationId && active.conversationId !== payload.conversationId)
      ) {
        return;
      }
      setError('Звонок завершён.');
      cleanup(false, active.callId);
    };

    const onCallError = (payload: { callId?: string | null; error?: { message?: string } }) => {
      const active = callRef.current;
      if (payload.callId && active?.callId !== payload.callId) return;
      setError(payload.error?.message ?? 'Ошибка сигнализации звонка.');
      if (active && payload.callId) cleanup(false, active.callId);
    };

    const onDisconnect = () => {
      const active = callRef.current;
      if (!active) return;
      setError('Realtime-соединение с сервером потеряно. Звонок завершён.');
      cleanup(false, active.callId);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:invite-incoming', onInviteIncoming);
    socket.on('call:participant-joined', onParticipantJoined);
    socket.on('call:participant-left', onParticipantLeft);
    socket.on('call:join-offer', (payload: JoinOfferPayload) => void onJoinOffer(payload));
    socket.on('call:join-answer', (payload: JoinAnswerPayload) => void onJoinAnswer(payload));
    socket.on('call:ice', onDirectedIce);
    socket.on('call:renegotiate', onRenegotiate);
    socket.on('call:renegotiate-answer', onRenegotiateAnswer);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice-candidate', onCandidate);
    socket.on('call:ended', onEnded);
    socket.on('call:error', onCallError);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:invite-incoming', onInviteIncoming);
      socket.off('call:participant-joined', onParticipantJoined);
      socket.off('call:participant-left', onParticipantLeft);
      socket.off('call:join-offer');
      socket.off('call:join-answer');
      socket.off('call:ice', onDirectedIce);
      socket.off('call:renegotiate', onRenegotiate);
      socket.off('call:renegotiate-answer', onRenegotiateAnswer);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onCandidate);
      socket.off('call:ended', onEnded);
      socket.off('call:error', onCallError);
      socket.off('disconnect', onDisconnect);
    };
  }, [
    bufferCandidate,
    cleanup,
    clearOutgoingTimeout,
    closeLink,
    createLinkEntry,
    createPeerConnection,
    flushCandidates,
    isCurrentOperation,
    patchMatchingCall,
    socket,
    syncLinks,
    updateCall,
  ]);

  useEffect(() => {
    const active = callRef.current;
    if (active && socketRef.current?.connected && active.status === 'active') {
      // Reflect the current media state over freshly opened links.
      sendLocalMediaState();
    }
  }, [sendLocalMediaState]);

  useEffect(() => () => cleanup(false), [cleanup]);

  const endCall = useCallback(() => {
    setError('');
    cleanup(true);
  }, [cleanup]);

  return {
    call,
    error,
    settings,
    devices,
    dismissError: () => setError(''),
    startCall,
    acceptCall,
    acceptInvite,
    declineInvite,
    inviteParticipant,
    endCall,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    setRemoteVolume,
    updateSettings,
    refreshDevices,
    setLocalVideoRef,
    setRemoteVideoRef,
    remoteVideoRefFor,
    setCurrentUser,
  };
}
