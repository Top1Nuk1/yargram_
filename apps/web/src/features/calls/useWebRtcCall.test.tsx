import { act, renderHook } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebRtcCall, type ActiveCall } from './useWebRtcCall';

type EventHandler = (payload: unknown) => void;

class FakeSocket {
  connected = true;
  readonly listeners = new Map<string, Set<EventHandler>>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];

  on(event: string, handler: EventHandler): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  receive(event: string, payload: unknown): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  emittedEvents(): string[] {
    return this.emitted.map((entry) => entry.event);
  }

  emittedPayloads(event: string): unknown[] {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

class FakeTrack {
  readonly kind: 'audio' | 'video';
  readonly readyState: MediaStreamTrackState = 'live';
  muted = false;
  enabled = true;
  onended: (() => void) | null = null;
  stop = vi.fn();

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];

  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  getTracks(): FakeTrack[] {
    return this.tracks;
  }

  addTrack(track: FakeTrack): void {
    this.tracks.push(track);
  }

  removeTrack(track: FakeTrack): void {
    const index = this.tracks.indexOf(track);
    if (index >= 0) this.tracks.splice(index, 1);
  }
}

class FakeChannel {
  readyState = 'open';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];

  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ondatachannel: ((event: { channel: unknown }) => void) | null = null;
  ontrack: ((event: { track: FakeTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  readonly addTrack = vi.fn(() => ({}));
  readonly addTransceiver = vi.fn(() => ({ sender: {} }));
  readonly createDataChannel = vi.fn(() => new FakeChannel());
  readonly createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
  readonly createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
  readonly setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  readonly setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description as RTCSessionDescription;
  });
  readonly addIceCandidate = vi.fn(async () => undefined);
  readonly getStats = vi.fn(async () => new Map());
  readonly close = vi.fn();

  constructor() {
    FakeRTCPeerConnection.instances.push(this);
  }
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  readonly close = vi.fn(async () => undefined);
  readonly resume = vi.fn(async () => undefined);
  readonly createGain = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  }));
  readonly createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  readonly createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
}

const callId = 'call-123';
const conversationId = 'conversation-123';

const alice = { id: 'u-alice', displayName: 'Alice', username: 'alice', bio: '', avatar: null, avatarUrl: null, email: undefined };
const bob = { id: 'u-bob', displayName: 'Bob', username: 'bob', bio: '', avatar: null, avatarUrl: null, email: undefined };
const carol = { id: 'u-carol', displayName: 'Carol', username: 'carol', bio: '', avatar: null, avatarUrl: null, email: undefined };
const dave = { id: 'u-dave', displayName: 'Dave', username: 'dave', bio: '', avatar: null, avatarUrl: null, email: undefined };

function mountHook() {
  const socket = new FakeSocket();
  const view = renderHook(() => useWebRtcCall(socket as unknown as Socket));
  return { socket, view };
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useWebRtcCall multi-participant signaling', () => {
  beforeEach(() => {
    FakeRTCPeerConnection.instances = [];
    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('MediaStream', FakeStream);
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => new FakeStream([new FakeTrack('audio')])),
        enumerateDevices: vi.fn(async () => []),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an incoming invite and accepts it by joining and offering to every participant', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });

    let call = view.result.current.call as ActiveCall;
    expect(call.status).toBe('incoming');
    expect(call.invited).toBe(true);
    expect(call.peer.id).toBe(alice.id);
    expect(call.links).toHaveLength(0);

    await act(async () => {
      await view.result.current.acceptInvite();
    });

    expect(socket.emittedPayloads('call:join')).toEqual([{ callId, conversationId }]);
    const offers = socket.emittedPayloads('call:join-offer') as Array<{
      callId: string;
      conversationId: string;
      toUserId: string;
      offer: { type: string; sdp: string };
    }>;
    expect(offers).toHaveLength(2);
    expect(new Set(offers.map((offer) => offer.toUserId))).toEqual(
      new Set([alice.id, bob.id]),
    );
    for (const offer of offers) {
      expect(offer.offer).toMatchObject({ type: 'offer', sdp: 'offer-sdp' });
    }
    expect(FakeRTCPeerConnection.instances).toHaveLength(2);

    call = view.result.current.call as ActiveCall;
    expect(call.status).toBe('connecting');
    expect(call.links).toHaveLength(2);
    expect(new Set(call.links.map((link) => link.userId))).toEqual(
      new Set([alice.id, bob.id]),
    );
    expect(call.links.every((link) => link.status === 'connecting')).toBe(true);
  });

  it('answers a join offer that arrives before participant-joined', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });
    await act(async () => {
      await view.result.current.acceptInvite();
    });
    expect(FakeRTCPeerConnection.instances).toHaveLength(2);

    await act(async () => {
      socket.receive('call:join-offer', {
        callId,
        conversationId,
        fromUserId: dave.id,
        offer: { type: 'offer', sdp: 'dave-offer-sdp' },
      });
    });
    await flushAsync();

    const answers = socket.emittedPayloads('call:join-answer') as Array<{
      callId: string;
      conversationId: string;
      fromUserId: string;
      answer: { type: string; sdp: string };
    }>;
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      callId,
      conversationId,
      fromUserId: dave.id,
      answer: { type: 'answer', sdp: 'answer-sdp' },
    });
    expect(FakeRTCPeerConnection.instances).toHaveLength(3);

    const call = view.result.current.call as ActiveCall;
    const daveLink = call.links.find((link) => link.userId === dave.id);
    expect(daveLink).toBeDefined();
    expect(daveLink?.status).toBe('connecting');
  });

  it('answers a join offer for a participant announced earlier without creating a second connection', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });
    await act(async () => {
      await view.result.current.acceptInvite();
    });
    expect(FakeRTCPeerConnection.instances).toHaveLength(2);

    await act(async () => {
      socket.receive('call:participant-joined', { callId, conversationId, user: dave });
    });
    let call = view.result.current.call as ActiveCall;
    const announced = call.links.find((link) => link.userId === dave.id);
    expect(announced).toBeDefined();
    expect(announced?.status).toBe('ringing');

    await act(async () => {
      socket.receive('call:join-offer', {
        callId,
        conversationId,
        fromUserId: dave.id,
        offer: { type: 'offer', sdp: 'dave-offer-sdp' },
      });
    });
    await flushAsync();

    expect(FakeRTCPeerConnection.instances).toHaveLength(3);
    const answers = socket.emittedPayloads('call:join-answer') as Array<{
      fromUserId: string;
    }>;
    expect(answers).toHaveLength(1);
    expect(answers[0].fromUserId).toBe(dave.id);
    call = view.result.current.call as ActiveCall;
    expect(call.links.find((link) => link.userId === dave.id)?.status).toBe('connecting');
  });

  it('applies a join answer and flushes buffered candidates', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });
    await act(async () => {
      await view.result.current.acceptInvite();
    });

    await act(async () => {
      socket.receive('call:ice', {
        callId,
        conversationId,
        fromUserId: bob.id,
        candidate: { candidate: 'buffered-candidate' },
      });
    });
    const aliceConnection = FakeRTCPeerConnection.instances[0];

    await act(async () => {
      socket.receive('call:join-answer', {
        callId,
        conversationId,
        fromUserId: bob.id,
        answer: { type: 'answer', sdp: 'bob-answer-sdp' },
      });
    });
    await flushAsync();

    const bobConnection = FakeRTCPeerConnection.instances[1];
    expect(bobConnection.setRemoteDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'answer', sdp: 'bob-answer-sdp' }),
    );
    expect(bobConnection.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: 'buffered-candidate' }),
    );
    expect(aliceConnection.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('removes a participant who left and closes their connection', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });
    await act(async () => {
      await view.result.current.acceptInvite();
    });
    const daveConnectionCount = FakeRTCPeerConnection.instances.length;

    await act(async () => {
      socket.receive('call:join-offer', {
        callId,
        conversationId,
        fromUserId: dave.id,
        offer: { type: 'offer', sdp: 'dave-offer-sdp' },
      });
    });
    await flushAsync();
    const daveConnection = FakeRTCPeerConnection.instances[daveConnectionCount];

    await act(async () => {
      socket.receive('call:participant-left', { callId, conversationId, userId: dave.id });
    });

    const call = view.result.current.call as ActiveCall;
    expect(call.links.find((link) => link.userId === dave.id)).toBeUndefined();
    expect(call.links).toHaveLength(2);
    expect(daveConnection.close).toHaveBeenCalled();

    await act(async () => {
      socket.receive('call:participant-left', { callId, conversationId, userId: dave.id });
    });
    expect(FakeRTCPeerConnection.instances).toHaveLength(daveConnectionCount + 1);
  });

  it('declines an incoming invite', async () => {
    const { socket, view } = mountHook();
    view.result.current.setCurrentUser(carol);

    await act(async () => {
      socket.receive('call:invite-incoming', {
        callId,
        conversationId,
        fromUser: alice,
        mode: 'audio',
        participants: [{ id: bob.id, displayName: bob.displayName, username: bob.username }],
      });
    });
    expect((view.result.current.call as ActiveCall).status).toBe('incoming');

    await act(async () => {
      view.result.current.declineInvite();
    });

    expect(socket.emittedPayloads('call:decline')).toEqual([{ callId, conversationId }]);
    expect(view.result.current.call).toBeNull();
  });
});
