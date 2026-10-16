import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '../../types';
import { MessageAttachments, VoiceMessage } from './AttachmentUi';
import { discoverAudioDuration } from './mediaDuration';
vi.mock('./mediaDuration', async (original) => ({ ...await original<typeof import('./mediaDuration')>(), discoverAudioDuration: vi.fn() }));
const attachment = { id: 'voice', url: '/voice.webm', fileName: 'voice.webm', mimeType: 'audio/webm', size: 1200 } as Attachment;
function metadata(audio: HTMLAudioElement, duration: number) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  Object.defineProperty(audio, 'readyState', { configurable: true, value: 1 });
  fireEvent(audio, new Event('durationchange'));
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.mocked(discoverAudioDuration).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('voice metadata and playback', () => {
  it('disables unknown/Infinity seeking, then uses later finite duration without moving playback', () => {
    const { container } = render(<VoiceMessage attachment={attachment} mine />);
    const audio = container.querySelector('audio')!;
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.disabled).toBe(true);
    expect(slider.max).toBe('0');
    metadata(audio, Infinity);
    expect(slider.disabled).toBe(true);
    expect(audio.currentTime).toBe(0);
    metadata(audio, 24);
    expect(slider.disabled).toBe(false);
    expect(slider.max).toBe('24');
    fireEvent.change(slider, { target: { value: '12' } });
    expect(audio.currentTime).toBe(12);
    fireEvent.play(audio);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Остановить');
    fireEvent.pause(audio);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Слушать');
  });
  it('uses supplied duration and resets on source change', () => {
    const { container, rerender } = render(<VoiceMessage attachment={{ ...attachment, durationSeconds: 18 } as Attachment} mine />);
    expect((screen.getByRole('slider') as HTMLInputElement).max).toBe('18');
    const previous = container.querySelector('audio');
    rerender(<VoiceMessage attachment={{ ...attachment, url: '/new.webm' }} mine />);
    expect(container.querySelector('audio')).not.toBe(previous);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
  });
  it.each([Infinity, 30])('recovers unseekable WebM duration %s without a giant probe seek, and releases URL', async (nativeDuration) => {
    const create = vi.fn(() => 'blob:repaired');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.mocked(discoverAudioDuration).mockResolvedValue({ duration: 30, blob: new Blob(['webm']) });
    const { container, unmount } = render(<VoiceMessage attachment={attachment} mine={false} />);
    const audio = container.querySelector('audio')!;
    metadata(audio, nativeDuration);
    await waitFor(() => expect(audio.getAttribute('src')).toBe('blob:repaired'));
    expect(audio.currentTime).toBe(0);
    expect((screen.getByRole('slider') as HTMLInputElement).max).toBe('30');
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:repaired');
  });
  it('renders a round video circle with its own controls, not the rectangular native bar', () => {
    const { container } = render(<MessageAttachments attachments={[{ ...attachment, mediaKind: 'video_circle' } as Attachment]} mine onOpenImage={vi.fn()} />);
    const video = container.querySelector('video')!;
    // Нативные controls рисуют прямоугольную панель поверх круглого кадра —
    // именно из-за неё кружок выглядел квадратом. Управление теперь своё.
    expect(video.controls).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe('metadata');
    expect(video.getAttribute('aria-label')).toContain('Видеосообщение');
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('видеокружок');
    // Круглый кадр: рамка обрезает видео по кругу, иначе виден квадрат.
    const frame = video.parentElement!;
    expect(frame.className).toContain('rounded-full');
    expect(frame.className).toContain('aspect-square');
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('toggles video circle playback from the overlay', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    const { container } = render(<MessageAttachments attachments={[{ ...attachment, mediaKind: 'video_circle' } as Attachment]} mine onOpenImage={vi.fn()} />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.click(screen.getByRole('button'));
    expect(play).toHaveBeenCalled();
  });

  it('changes playback speed when clicking the speed indicator', () => {
    const { container } = render(<VoiceMessage attachment={{ ...attachment, durationSeconds: 20 } as Attachment} mine />);
    const audio = container.querySelector('audio')!;
    const speedBadge = screen.getByText('1x');
    expect(speedBadge).toBeDefined();
    fireEvent.click(speedBadge);
    expect(screen.getByText('1.5x')).toBeDefined();
    expect(audio.playbackRate).toBe(1.5);
    fireEvent.click(screen.getByText('1.5x'));
    expect(screen.getByText('2x')).toBeDefined();
    expect(audio.playbackRate).toBe(2);
    fireEvent.click(screen.getByText('2x'));
    expect(screen.getByText('1x')).toBeDefined();
    expect(audio.playbackRate).toBe(1);
  });

  it('pauses when another voice message starts playing', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    render(<VoiceMessage attachment={{ ...attachment, id: 'voice-1' } as Attachment} mine />);
    window.dispatchEvent(new CustomEvent('yargram:voice-play', { detail: { id: 'voice-2' } }));
    expect(pauseSpy).toHaveBeenCalled();
  });
});
