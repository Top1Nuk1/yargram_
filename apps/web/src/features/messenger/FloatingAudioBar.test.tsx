import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioManager } from '../../lib/audioManager';
import { FloatingAudioBar } from './FloatingAudioBar';

describe('FloatingAudioBar', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    audioManager.close();
  });

  afterEach(() => {
    cleanup();
    audioManager.close();
    vi.restoreAllMocks();
  });

  it('renders nothing when no track is active', () => {
    const { container } = render(<FloatingAudioBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders floating bar when track is registered', () => {
    const dummyAudio = document.createElement('audio');
    audioManager.registerLocalPlay('test-1', '/audio.mp3', 'Аудиозапись 1', 60, dummyAudio, 1);

    render(<FloatingAudioBar />);
    expect(screen.getByText('Аудиозапись 1')).toBeDefined();
    expect(screen.getByText('00:00 / 01:00')).toBeDefined();
  });

  it('toggles playback rate when clicking speed button', () => {
    const dummyAudio = document.createElement('audio');
    audioManager.registerLocalPlay('test-2', '/audio.mp3', 'Голосовое', 30, dummyAudio, 1);

    render(<FloatingAudioBar />);
    const speedButton = screen.getByTitle('Скорость воспроизведения');
    expect(speedButton.textContent).toBe('1x');

    fireEvent.click(speedButton);
    expect(speedButton.textContent).toBe('1.5x');

    fireEvent.click(speedButton);
    expect(speedButton.textContent).toBe('2x');

    fireEvent.click(speedButton);
    expect(speedButton.textContent).toBe('1x');
  });

  it('closes player and hides bar when close button is clicked', () => {
    const dummyAudio = document.createElement('audio');
    audioManager.registerLocalPlay('test-3', '/audio.mp3', 'Трек для закрытия', 45, dummyAudio, 1);

    const { container } = render(<FloatingAudioBar />);
    expect(container.firstChild).not.toBeNull();

    const closeButton = screen.getByLabelText('Закрыть плеер');
    fireEvent.click(closeButton);

    expect(container.firstChild).toBeNull();
  });
});
