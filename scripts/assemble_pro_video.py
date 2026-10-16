import os
import sys
import math
import struct
import wave
import random
import subprocess
from PIL import Image, ImageDraw
import imageio_ffmpeg

OUTPUT_DIR = os.path.abspath("media/youtube")
SCENES_DIR = os.path.join(OUTPUT_DIR, "scenes")

OUTPUT_VIDEO = os.path.join(OUTPUT_DIR, "yargram_zbt_001.mp4")
OUTPUT_AUDIO = os.path.join(OUTPUT_DIR, "soundtrack.wav")
BRAIN_VIDEO = "C:/Users/Top1Nuk1/.gemini/antigravity/brain/fcec37b7-aaf5-4869-a0b5-159e965a625d/yargram_zbt_001.mp4"

# -------------------------------------------------------------
# 1. GENERATE AUDIO SOUNDTRACK (27.0s, 128 BPM)
# -------------------------------------------------------------
def generate_soundtrack(duration_sec, output_path):
    print(f"[1/3] Синтез саундтрека ({duration_sec} сек, 128 BPM)...")
    sample_rate = 44100
    total_samples = int(duration_sec * sample_rate)
    bpm = 128.0
    beat_sec = 60.0 / bpm
    subbeat_sec = beat_sec / 4.0

    # Chords: Am (110Hz), F (87.3Hz), C (65.4Hz), G (98Hz)
    progression = [
        [110.0, 130.81, 164.81],
        [87.31, 110.0, 130.81],
        [65.41, 82.41, 98.0],
        [98.0, 123.47, 146.83],
    ]

    buffer = [0.0] * total_samples

    # Synths & Bass
    for i in range(total_samples):
        t = i / sample_rate
        bar = int(t / (beat_sec * 4)) % len(progression)
        chord = progression[bar]
        
        # 16th note arpeggio
        step = int((t % beat_sec) / subbeat_sec)
        note_freq = chord[step % len(chord)] * 2.0
        note_t = (t % subbeat_sec)
        note_env = math.exp(-note_t * 15.0)
        
        phase = (t * note_freq) % 1.0
        wave_val = (2.0 * phase - 1.0) * 0.13 * note_env
        
        # Bass
        bass_freq = chord[0]
        bass_env = math.exp(-(t % beat_sec) * 3.8)
        bass_val = math.sin(2.0 * math.pi * bass_freq * t) * 0.24 * bass_env
        
        buffer[i] += wave_val + bass_val

    # Drums
    total_beats = int(duration_sec / beat_sec)
    for beat in range(total_beats):
        beat_start = int(beat * beat_sec * sample_rate)
        beat_in_bar = beat % 4
        
        # Kick drum on every beat
        kick_len = int(0.18 * sample_rate)
        for s in range(min(kick_len, total_samples - beat_start)):
            st = s / sample_rate
            pitch = 40.0 + 130.0 * math.exp(-st * 36.0)
            env = math.exp(-st * 20.0)
            buffer[beat_start + s] += math.sin(2.0 * math.pi * pitch * st) * 0.46 * env
            
        # Snare on 2 and 4 (beats 1 and 3)
        if beat_in_bar in [1, 3]:
            snare_len = int(0.22 * sample_rate)
            rand = random.Random(beat * 999)
            for s in range(min(snare_len, total_samples - beat_start)):
                st = s / sample_rate
                noise = (rand.random() * 2.0 - 1.0) * math.exp(-st * 24.0) * 0.28
                tone = math.sin(2.0 * math.pi * 185.0 * st) * math.exp(-st * 28.0) * 0.22
                buffer[beat_start + s] += noise + tone

        # Hi-Hats on 16ths
        for sixteenth in range(4):
            hat_start = beat_start + int(sixteenth * subbeat_sec * sample_rate)
            hat_len = int(0.04 * sample_rate)
            rand = random.Random((beat * 4 + sixteenth) * 777)
            for s in range(min(hat_len, total_samples - hat_start)):
                st = s / sample_rate
                noise = (rand.random() * 2.0 - 1.0) * math.exp(-st * 90.0) * 0.12
                buffer[hat_start + s] += noise

    # Transition Whooshes
    transitions = [4.5, 9.5, 14.5, 19.5, 23.5]
    for tr_time in transitions:
        tr_start = int((tr_time - 0.7) * sample_rate)
        tr_len = int(1.0 * sample_rate)
        for s in range(min(tr_len, total_samples - max(0, tr_start))):
            idx = max(0, tr_start) + s
            if idx >= total_samples: break
            st = s / sample_rate
            sweep_freq = 200.0 + 1800.0 * (st / 1.0)**2
            env = math.sin(math.pi * (st / 1.0)) * 0.2
            buffer[idx] += math.sin(2.0 * math.pi * sweep_freq * st) * env

    # Normalize
    max_val = max(abs(x) for x in buffer) or 1.0
    scale = 0.85 / max_val
    
    with wave.open(output_path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        packed = []
        for val in buffer:
            v = max(-1.0, min(1.0, val * scale))
            packed.append(struct.pack("<h", int(v * 32767.0)))
        wf.writeframes(b"".join(packed))
    print(f" -> Аудио трек готов: {output_path}")

# -------------------------------------------------------------
# 2. VIDEO MONTAGE ENGINE
# -------------------------------------------------------------
def main():
    duration_sec = 27.0
    fps = 30
    total_frames = int(duration_sec * fps)
    width, height = 1920, 1080

    generate_soundtrack(duration_sec, OUTPUT_AUDIO)

    print("[2/3] Загрузка мастер-кадров сцен...")
    scene_files = [
        "s1_intro.png",
        "s2_landing.png",
        "s3_chat.png",
        "s4_poll.png",
        "s5_responsive.png",
        "s6_outro.png"
    ]
    scene_images = []
    for sf in scene_files:
        p = os.path.join(SCENES_DIR, sf)
        if not os.path.exists(p):
            raise FileNotFoundError(f"Не найден мастер-кадр: {p}")
        im = Image.open(p).convert("RGBA")
        scene_images.append(im)

    # Scene timing breakpoints (in seconds)
    # S1: 0.0 - 4.5
    # S2: 4.5 - 9.5
    # S3: 9.5 - 14.5
    # S4: 14.5 - 19.5
    # S5: 19.5 - 23.5
    # S6: 23.5 - 27.0
    timings = [
        (0.0, 4.5),
        (4.5, 9.5),
        (9.5, 14.5),
        (14.5, 19.5),
        (19.5, 23.5),
        (23.5, 27.0)
    ]
    transition_dur = 0.4  # 12 frames cross-dissolve

    print(f"[3/3] Запуск FFmpeg рендера видео ({total_frames} кадров, 30 FPS)...")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-i", OUTPUT_AUDIO,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "faster",
        "-crf", "19",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        OUTPUT_VIDEO
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def get_zoomed_frame(img, zoom_factor):
        """Плавный кинематографичный Ken Burns зум от центра"""
        if abs(zoom_factor - 1.0) < 0.001:
            return img
        zw = int(width * zoom_factor)
        zh = int(height * zoom_factor)
        # Resize then crop center
        res = img.resize((zw, zh), Image.Resampling.BILINEAR)
        left = (zw - width) // 2
        top = (zh - height) // 2
        return res.crop((left, top, left + width, top + height))

    for frame_idx in range(total_frames):
        t = frame_idx / fps
        
        # Определяем текущую сцену
        cur_scene_idx = 0
        for i, (start_t, end_t) in enumerate(timings):
            if start_t <= t < end_t:
                cur_scene_idx = i
                break
        if t >= timings[-1][1]:
            cur_scene_idx = len(timings) - 1

        start_t, end_t = timings[cur_scene_idx]
        scene_dur = end_t - start_t
        scene_local_t = t - start_t
        norm_t = scene_local_t / scene_dur

        # Subtle Ken Burns zoom (1.00 -> 1.045)
        zoom = 1.00 + 0.045 * norm_t
        cur_img = get_zoomed_frame(scene_images[cur_scene_idx], zoom)

        # Cross-dissolve check with next scene
        time_until_end = end_t - t
        if time_until_end < transition_dur and cur_scene_idx < len(timings) - 1:
            next_idx = cur_scene_idx + 1
            next_img = get_zoomed_frame(scene_images[next_idx], 1.00)
            alpha = (transition_dur - time_until_end) / transition_dur
            # Blend
            cur_img = Image.blend(cur_img, next_img, alpha)

        # Draw Bottom Progress Bar
        draw = ImageDraw.Draw(cur_img)
        progress = t / duration_sec
        bar_w = int(width * progress)
        draw.rectangle([0, height - 7, bar_w, height], fill=(56, 189, 248, 240))

        # Stream frame to FFmpeg
        proc.stdin.write(cur_img.convert("RGB").tobytes())

        if frame_idx % 60 == 0 or frame_idx == total_frames - 1:
            pct = int(progress * 100)
            sys.stdout.write(f"\rКодирование видео: {pct}% ({frame_idx+1}/{total_frames})")
            sys.stdout.flush()

    print("\nФинализация видео потока...")
    proc.stdin.close()
    proc.wait()
    print(f"Готово! Видео успешно создано: {OUTPUT_VIDEO}")

    # Copy to artifacts directory
    try:
        import shutil
        shutil.copyfile(OUTPUT_VIDEO, BRAIN_VIDEO)
        print(f"Скопировано в артефакты: {BRAIN_VIDEO}")
    except Exception as e:
        print("Копирование в артефакты:", e)

if __name__ == "__main__":
    main()
