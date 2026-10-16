import os
import sys
import math
import struct
import wave
import random
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

# Paths
OUTPUT_DIR = os.path.abspath("media/youtube")
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOGO_PATH = os.path.abspath("media/youtube/yargram.png")
WALLPAPER_PATH = os.path.abspath("apps/web/public/wallpapers/Yargram-wallpaper-aurora-dark.png")
MOCKUP_LANDING = os.path.abspath("media/youtube/elements/mockup_landing.png")
MOCKUP_CHAT = os.path.abspath("media/youtube/elements/mockup_chat.png")
MOCKUP_POLL = os.path.abspath("media/youtube/elements/mockup_poll.png")
MOCKUP_PHONE = os.path.abspath("media/youtube/elements/mockup_phone.png")

OUTPUT_VIDEO = os.path.join(OUTPUT_DIR, "yargram_zbt_001.mp4")
OUTPUT_AUDIO = os.path.join(OUTPUT_DIR, "soundtrack.wav")

FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REGULAR = "C:/Windows/Fonts/segoeui.ttf"

def get_font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def ease_out_cubic(t):
    return 1.0 - math.pow(1.0 - t, 3)

def ease_in_out_cubic(t):
    if t < 0.5:
        return 4.0 * t * t * t
    else:
        return 1.0 - math.pow(-2.0 * t + 2.0, 3) / 2.0

def ease_out_back(t, s=1.70158):
    t -= 1.0
    return t * t * ((s + 1.0) * t + s) + 1.0

# -------------------------------------------------------------
# AUDIO SYNTHESIS (Dynamic 128 BPM Cyber-Beat + Sound FX)
# -------------------------------------------------------------
def generate_soundtrack(duration_sec, output_path):
    print(f"Генерация саундтрека ({duration_sec} сек, 128 BPM)...")
    sample_rate = 44100
    total_samples = int(duration_sec * sample_rate)
    bpm = 128.0
    beat_sec = 60.0 / bpm
    subbeat_sec = beat_sec / 4.0 # 16th note

    # Chord progression: Am (A2/C3/E3), F (F2/A2/C3), C (C2/E2/G2), G (G2/B2/D3)
    progression = [
        [110.0, 130.81, 164.81], # Am
        [87.31, 110.0, 130.81],  # F
        [65.41, 82.41, 98.0],    # C
        [98.0, 123.47, 146.83],  # G
    ]

    buffer = [0.0] * total_samples

    # 1. Synth Arpeggios & Chords
    for i in range(total_samples):
        t = i / sample_rate
        bar = int(t / (beat_sec * 4)) % len(progression)
        chord = progression[bar]
        
        # 16th note arpeggio step
        step = int((t % beat_sec) / subbeat_sec)
        note_freq = chord[step % len(chord)] * 2.0 # Higher octave
        
        # Note envelope
        note_t = (t % subbeat_sec)
        note_env = math.exp(-note_t * 14.0)
        
        # Pluck wave (sawtooth approximation)
        phase = (t * note_freq) % 1.0
        wave_val = (2.0 * phase - 1.0) * 0.12 * note_env
        
        # Sub Bass
        bass_freq = chord[0]
        bass_env = math.exp(-(t % beat_sec) * 3.5)
        bass_val = math.sin(2.0 * math.pi * bass_freq * t) * 0.22 * bass_env
        
        buffer[i] += wave_val + bass_val

    # 2. Drums (Kick, Snare, Hi-Hat)
    total_beats = int(duration_sec / beat_sec)
    for beat in range(total_beats):
        beat_start = int(beat * beat_sec * sample_rate)
        beat_in_bar = beat % 4
        
        # Kick drum on 0, 1, 2, 3 (Four-on-the-floor driving beat)
        kick_len = int(0.18 * sample_rate)
        for s in range(min(kick_len, total_samples - beat_start)):
            st = s / sample_rate
            # Pitch drop from 160Hz to 40Hz
            pitch = 40.0 + 120.0 * math.exp(-st * 35.0)
            env = math.exp(-st * 20.0)
            val = math.sin(2.0 * math.pi * pitch * st) * 0.45 * env
            buffer[beat_start + s] += val
            
        # Snare / Clap on beats 1 and 3 (2 and 4 in 4/4 count)
        if beat_in_bar in [1, 3]:
            snare_len = int(0.22 * sample_rate)
            rand = random.Random(beat * 999)
            for s in range(min(snare_len, total_samples - beat_start)):
                st = s / sample_rate
                noise = (rand.random() * 2.0 - 1.0) * math.exp(-st * 22.0) * 0.28
                tone = math.sin(2.0 * math.pi * 185.0 * st) * math.exp(-st * 28.0) * 0.2
                buffer[beat_start + s] += noise + tone

        # Hi-Hats on 16th notes
        for sixteenth in range(4):
            hat_start = beat_start + int(sixteenth * subbeat_sec * sample_rate)
            hat_len = int(0.04 * sample_rate)
            rand = random.Random((beat * 4 + sixteenth) * 777)
            for s in range(min(hat_len, total_samples - hat_start)):
                st = s / sample_rate
                noise = (rand.random() * 2.0 - 1.0) * math.exp(-st * 90.0) * 0.12
                buffer[hat_start + s] += noise

    # 3. Transition Whooshes at Scene boundaries
    transition_times = [4.5, 9.5, 15.0, 20.0, 23.5]
    for tr_time in transition_times:
        tr_start = int((tr_time - 0.7) * sample_rate)
        tr_len = int(1.0 * sample_rate)
        for s in range(min(tr_len, total_samples - max(0, tr_start))):
            idx = max(0, tr_start) + s
            if idx >= total_samples: break
            st = s / sample_rate
            sweep_freq = 200.0 + 1800.0 * (st / 1.0)**2
            env = math.sin(math.pi * (st / 1.0)) * 0.18
            buffer[idx] += math.sin(2.0 * math.pi * sweep_freq * st) * env

    # Master normalization and soft limiter
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
    print(f" -> Сохранено аудио: {output_path}")

# -------------------------------------------------------------
# GRAPHICS & FRAME COMPOSITING
# -------------------------------------------------------------
def draw_centered_text(draw, text, font, cy, fill, canvas_w=1920, stroke_fill=None, stroke_width=0):
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (canvas_w - w) // 2
    y = cy - h // 2
    draw.text((x, y), text, font=font, fill=fill, stroke_fill=stroke_fill, stroke_width=stroke_width)
    return x, y, w, h

def draw_pill(draw, cx, cy, text, font, bg_color, text_color, border_color=None, border_width=1, pad_x=22, pad_y=8):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    bw = tw + pad_x * 2
    bh = th + pad_y * 2
    x0 = cx - bw // 2
    y0 = cy - bh // 2
    radius = bh // 2
    draw.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=radius, fill=bg_color, outline=border_color, width=border_width)
    draw.text((x0 + pad_x, y0 + pad_y - 2), text, font=font, fill=text_color)
    return x0, y0, bw, bh

def create_base_background(width=1920, height=1080):
    """Пререндер красивого фонового градиента с сеткой и сиянием"""
    if os.path.exists(WALLPAPER_PATH):
        bg = Image.open(WALLPAPER_PATH).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
        bg = bg.filter(ImageFilter.GaussianBlur(18))
    else:
        bg = Image.new("RGBA", (width, height), (7, 10, 18, 255))
        
    overlay = Image.new("RGBA", (width, height), (6, 9, 15, 200))
    base = Image.alpha_composite(bg, overlay)
    draw = ImageDraw.Draw(base)
    
    # Ambient glowing orbs
    draw.ellipse([200, 200, 900, 900], fill=(14, 165, 233, 25))
    draw.ellipse([1100, 100, 1800, 800], fill=(147, 51, 234, 30))
    
    # Cyber grid lines
    for x in range(0, width, 60):
        draw.line([(x, 0), (x, height)], fill=(59, 130, 246, 12), width=1)
    for y in range(0, height, 60):
        draw.line([(0, y), (width, y)], fill=(59, 130, 246, 12), width=1)
        
    return base

# -------------------------------------------------------------
# MAIN VIDEO GENERATION PIPELINE
# -------------------------------------------------------------
def main():
    duration_sec = 26.0
    fps = 30
    total_frames = int(duration_sec * fps)
    width, height = 1920, 1080
    
    print(f"Старт монтажа видео ЗБТ 0.0.1 ({total_frames} кадров, {fps} FPS, {width}x{height})...")
    
    # 1. Генерация аудио
    generate_soundtrack(duration_sec, OUTPUT_AUDIO)
    
    # 2. Загрузка ассетов
    print("Загрузка элементов мокапов...")
    base_bg = create_base_background(width, height)
    
    img_logo = Image.open(LOGO_PATH).convert("RGBA") if os.path.exists(LOGO_PATH) else None
    mock_landing = Image.open(MOCKUP_LANDING).convert("RGBA") if os.path.exists(MOCKUP_LANDING) else None
    mock_chat = Image.open(MOCKUP_CHAT).convert("RGBA") if os.path.exists(MOCKUP_CHAT) else None
    mock_poll = Image.open(MOCKUP_POLL).convert("RGBA") if os.path.exists(MOCKUP_POLL) else None
    mock_phone = Image.open(MOCKUP_PHONE).convert("RGBA") if os.path.exists(MOCKUP_PHONE) else None
    
    # Fonts
    f_huge = get_font(72, bold=True)
    f_title = get_font(52, bold=True)
    f_sub = get_font(24, bold=False)
    f_badge = get_font(20, bold=True)
    f_small = get_font(18, bold=True)

    # Запуск FFmpeg процесса для сборки видео
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
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        OUTPUT_VIDEO
    ]
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Scenes timeline (in seconds):
    # Scene 1: 0.0 - 4.5  (Intro, Logo Reveal, ZBT Announcement)
    # Scene 2: 4.5 - 9.5  (Landing Page, Speed & Browser Access)
    # Scene 3: 9.5 - 15.0 (Chats & Group Messaging, Reactions)
    # Scene 4: 15.0 - 20.0 (Interactive Polls)
    # Scene 5: 20.0 - 23.5 (Responsive: Desktop + Mobile side-by-side)
    # Scene 6: 23.5 - 26.0 (Outro: CTA, yargram.site)
    
    print("Рендеринг сцен и анимации...")
    
    for frame_idx in range(total_frames):
        t = frame_idx / fps
        im = base_bg.copy()
        draw = ImageDraw.Draw(im)
        
        # --- SCENE 1: INTRO (0.0s - 4.5s) ---
        if t < 4.5:
            st = t / 4.5
            # Scale-in Logo with bounce
            scale_t = min(1.0, t / 1.4)
            scale = 0.5 + 0.5 * ease_out_back(scale_t, s=1.2)
            alpha_fade = min(1.0, t / 0.8)
            if t > 4.0:
                alpha_fade = max(0.0, (4.5 - t) / 0.5) # fade out
                
            logo_sz = int(360 * scale)
            if img_logo and logo_sz > 10:
                cur_logo = img_logo.resize((logo_sz, logo_sz), Image.Resampling.LANCZOS)
                lx = (width - logo_sz) // 2
                ly = (height - logo_sz) // 2 - 120
                im.paste(cur_logo, (lx, ly), cur_logo)
                
            # Text Reveal
            if t > 0.6:
                txt_t = min(1.0, (t - 0.6) / 0.8)
                y_shift = int(30 * (1.0 - ease_out_cubic(txt_t)))
                draw_centered_text(draw, "YARGRAM", f_huge, 640 + y_shift, (255, 255, 255))
                draw_centered_text(draw, "СОВРЕМЕННЫЙ ВЕБ-МЕССЕНДЖЕР", f_sub, 725 + y_shift, (147, 197, 253))
                
            if t > 1.2:
                badge_t = min(1.0, (t - 1.2) / 0.6)
                b_scale = ease_out_back(badge_t, s=1.4)
                draw_pill(draw, width // 2, 810, "🔥 ОФИЦИАЛЬНЫЙ СТАРТ ЗБТ 0.0.1", f_badge,
                          bg_color=(220, 38, 38, 220), text_color=(255, 255, 255),
                          border_color=(248, 113, 113), border_width=2)
                
        # --- SCENE 2: LANDING & FAST ACCESS (4.5s - 9.5s) ---
        elif t < 9.5:
            st = (t - 4.5) / 5.0
            # Slide in
            in_t = min(1.0, (t - 4.5) / 1.0)
            cur_ease = ease_out_cubic(in_t)
            
            # Subtle float
            float_y = math.sin(t * 2.5) * 6.0
            
            draw_centered_text(draw, "МОЛНИЕНОСНЫЙ И БЕЗОПАСНЫЙ", f_title, 110, (255, 255, 255))
            draw_centered_text(draw, "Работает прямо в браузере • Доступен на yargram.site", f_sub, 175, (148, 163, 184))
            
            # Mockup position
            if mock_landing:
                mw, mh = 1100, 660
                mock_scaled = mock_landing.resize((mw, mh), Image.Resampling.LANCZOS)
                my = int(240 + float_y + (1.0 - cur_ease) * 150)
                mx = (width - mw) // 2
                im.paste(mock_scaled, (mx, my), mock_scaled)
                
            # Badges at bottom
            draw_pill(draw, width // 2 - 280, 970, "⚡ МГНОВЕННЫЙ ОТКЛИК", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(147, 197, 253), border_color=(59, 130, 246))
            draw_pill(draw, width // 2, 970, "🔒 ШИФРОВАНИЕ ДАННЫХ", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(167, 139, 250), border_color=(147, 51, 234))
            draw_pill(draw, width // 2 + 280, 970, "🌐 БЕЗ УСТАНОВКИ", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(110, 231, 183), border_color=(16, 185, 129))

        # --- SCENE 3: REAL CHATS & COMMUNITY (9.5s - 15.0s) ---
        elif t < 15.0:
            st = (t - 9.5) / 5.5
            in_t = min(1.0, (t - 9.5) / 1.0)
            cur_ease = ease_out_cubic(in_t)
            float_y = math.sin(t * 2.5) * 6.0
            
            draw_centered_text(draw, "ЧАТЫ, ГРУППЫ И РЕАКЦИИ", f_title, 110, (255, 255, 255))
            draw_centered_text(draw, "Личные диалоги, каналы сообществ и живое общение", f_sub, 175, (148, 163, 184))
            
            if mock_chat:
                mw, mh = 1100, 660
                mock_scaled = mock_chat.resize((mw, mh), Image.Resampling.LANCZOS)
                my = int(240 + float_y + (1.0 - cur_ease) * 150)
                mx = (width - mw) // 2
                im.paste(mock_scaled, (mx, my), mock_scaled)
                
            # Floating animated reaction bubble
            bubble_y = int(450 + math.sin(t * 4.0) * 10.0)
            draw_pill(draw, 340, bubble_y, "🔥 12", f_badge, bg_color=(239, 68, 68, 240), text_color=(255, 255, 255))
            draw_pill(draw, 1580, bubble_y + 80, "❤️ 8", f_badge, bg_color=(236, 72, 153, 240), text_color=(255, 255, 255))

            draw_pill(draw, width // 2 - 200, 970, "💬 ЛИЧНЫЕ И ГРУППОВЫЕ БЕСЕДЫ", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(147, 197, 253), border_color=(59, 130, 246))
            draw_pill(draw, width // 2 + 200, 970, "🎉 ЭМОДЗИ И РЕАКЦИИ", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(251, 146, 60), border_color=(249, 115, 22))

        # --- SCENE 4: INTERACTIVE POLLS (15.0s - 20.0s) ---
        elif t < 20.0:
            st = (t - 15.0) / 5.0
            in_t = min(1.0, (t - 15.0) / 1.0)
            cur_ease = ease_out_cubic(in_t)
            float_y = math.sin(t * 2.5) * 6.0
            
            draw_centered_text(draw, "ИНТЕРАКТИВНЫЕ ОПРОСЫ", f_title, 110, (255, 255, 255))
            draw_centered_text(draw, "Голосование в реальном времени • Настраиваемые сроки", f_sub, 175, (148, 163, 184))
            
            if mock_poll:
                mw, mh = 1100, 660
                mock_scaled = mock_poll.resize((mw, mh), Image.Resampling.LANCZOS)
                my = int(240 + float_y + (1.0 - cur_ease) * 150)
                mx = (width - mw) // 2
                im.paste(mock_scaled, (mx, my), mock_scaled)
                
            draw_pill(draw, width // 2 - 220, 970, "📊 ЖИВЫЕ ИТОГИ ГОЛОСОВАНИЯ", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(56, 189, 248), border_color=(14, 165, 233))
            draw_pill(draw, width // 2 + 220, 970, "⏱️ ПРЕСЕТЫ И СВОЙ ДЕДЛАЙН", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(192, 132, 252), border_color=(168, 85, 247))

        # --- SCENE 5: MOBILE & DESKTOP (20.0s - 23.5s) ---
        elif t < 23.5:
            st = (t - 20.0) / 3.5
            in_t = min(1.0, (t - 20.0) / 0.8)
            cur_ease = ease_out_cubic(in_t)
            
            draw_centered_text(draw, "ДОСТУПЕН НА ВСЕХ УСТРОЙСТВАХ", f_title, 110, (255, 255, 255))
            draw_centered_text(draw, "ПК • Ноутбуки • Планшеты • Смартфоны", f_sub, 175, (148, 163, 184))
            
            # Left: Desktop mockup
            if mock_chat:
                mw, mh = 980, 590
                mock_scaled = mock_chat.resize((mw, mh), Image.Resampling.LANCZOS)
                my = 270
                mx = int(240 + (1.0 - cur_ease) * -200)
                im.paste(mock_scaled, (mx, my), mock_scaled)
                
            # Right/Front: Mobile mockup
            if mock_phone:
                pw, ph = 280, 580
                phone_scaled = mock_phone.resize((pw, ph), Image.Resampling.LANCZOS)
                py = 280 + int(math.sin(t * 3.0) * 8.0)
                px = int(1280 + (1.0 - cur_ease) * 200)
                im.paste(phone_scaled, (px, py), phone_scaled)
                
            draw_pill(draw, width // 2, 970, "📱 100% АДАПТИВНЫЙ ИНТЕРФЕЙС", f_small,
                      bg_color=(30, 41, 59, 230), text_color=(110, 231, 183), border_color=(16, 185, 129))

        # --- SCENE 6: OUTRO / CALL TO ACTION (23.5s - 26.0s) ---
        else:
            st = (t - 23.5) / 2.5
            in_t = min(1.0, (t - 23.5) / 0.8)
            cur_ease = ease_out_back(in_t, s=1.2)
            
            logo_sz = 200
            if img_logo:
                cur_logo = img_logo.resize((logo_sz, logo_sz), Image.Resampling.LANCZOS)
                im.paste(cur_logo, ((width - logo_sz) // 2, 180), cur_logo)
                
            draw_centered_text(draw, "ПРИСОЕДИНЯЙСЯ К ЗБТ 0.0.1!", f_title, 450, (255, 255, 255))
            draw_centered_text(draw, "Стань одним из первых пользователей Yargram", f_sub, 530, (147, 197, 253))
            
            # Big Pulsing CTA Button
            pulse = 1.0 + math.sin(t * 6.0) * 0.04
            draw_pill(draw, width // 2, 660, "👉 ПЕРЕЙТИ НА YARGRAM.SITE", f_title,
                      bg_color=(37, 99, 235, 240), text_color=(255, 255, 255),
                      border_color=(147, 197, 253), border_width=3, pad_x=40, pad_y=16)
            
            draw_centered_text(draw, "Подписывайся на канал — следи за обновлениями!", f_sub, 810, (148, 163, 184))

        # Bottom Sleek Progress Bar
        progress = t / duration_sec
        draw.rectangle([0, height - 6, int(width * progress), height], fill=(56, 189, 248, 230))
        
        # Stream frame to FFmpeg
        proc.stdin.write(im.convert("RGB").tobytes())
        
        if frame_idx % 60 == 0 or frame_idx == total_frames - 1:
            pct = int(progress * 100)
            sys.stdout.write(f"\rПрогресс рендера: {pct}% ({frame_idx+1}/{total_frames})")
            sys.stdout.flush()
            
    print("\nЗавершение кодирования видео FFmpeg...")
    proc.stdin.close()
    proc.wait()
    print(f"Готово! Видео сохранено в: {OUTPUT_VIDEO}")
    
    # Copy to artifacts directory
    brain_video = "C:/Users/Top1Nuk1/.gemini/antigravity/brain/fcec37b7-aaf5-4869-a0b5-159e965a625d/yargram_zbt_001.mp4"
    try:
        import shutil
        shutil.copyfile(OUTPUT_VIDEO, brain_video)
        print(f"Скопировано в артефакты: {brain_video}")
    except Exception as e:
        print("Копирование в артефакты:", e)

if __name__ == "__main__":
    main()
