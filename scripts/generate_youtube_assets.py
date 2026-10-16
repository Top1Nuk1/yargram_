import os
import sys
import math
import struct
import wave
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

OUTPUT_DIR = os.path.abspath("media/youtube")
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOGO_PATH = os.path.abspath("apps/landing/public/brand/yargram.png")
WALLPAPER_PATH = os.path.abspath("apps/web/public/wallpapers/Yargram-wallpaper-aurora-dark.png")
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REGULAR = "C:/Windows/Fonts/segoeui.ttf"

def get_font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def draw_rounded_rect(draw, bbox, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

def create_gradient_radial(width, height, center, radius, color_center, color_edge):
    base = Image.new("RGBA", (width, height), color_edge)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    cx, cy = center
    steps = 40
    for i in range(steps, 0, -1):
        r = radius * (i / steps)
        t = i / steps
        alpha = int(color_center[3] * (1.0 - t))
        c = (color_center[0], color_center[1], color_center[2], alpha)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    
    return Image.alpha_composite(base, overlay)

# -------------------------------------------------------------
# 1. CHANNEL AVATAR (800x800)
# -------------------------------------------------------------
def generate_channel_avatar():
    print("[1/4] Generating Channel Avatar (800x800)...")
    width, height = 800, 800
    im = Image.new("RGBA", (width, height), (10, 14, 23, 255))
    
    # Background subtle radial glow
    glow = create_gradient_radial(width, height, (400, 400), 380, (59, 130, 246, 120), (10, 14, 23, 0))
    im = Image.alpha_composite(im, glow)
    
    draw = ImageDraw.Draw(im)
    
    # Outer circular gradient ring
    draw.ellipse([50, 50, 750, 750], outline=(59, 130, 246, 80), width=4)
    draw.ellipse([70, 70, 730, 730], outline=(147, 51, 234, 40), width=2)
    
    # Place YarGram logo centered
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo = logo.resize((460, 460), Image.Resampling.LANCZOS)
        im.paste(logo, (170, 170), logo)
    
    out_path = os.path.join(OUTPUT_DIR, "channel_avatar_800x800.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 2. CHANNEL BANNER (2560x1440)
# -------------------------------------------------------------
def generate_channel_banner():
    print("[2/4] Generating Channel Banner (2560x1440)...")
    width, height = 2560, 1440
    
    # Base background
    if os.path.exists(WALLPAPER_PATH):
        bg = Image.open(WALLPAPER_PATH).convert("RGBA")
        bg = bg.resize((width, height), Image.Resampling.LANCZOS)
        bg = bg.filter(ImageFilter.GaussianBlur(12))
    else:
        bg = Image.new("RGBA", (width, height), (11, 15, 25, 255))
    
    # Dark gradient overlay
    overlay = Image.new("RGBA", (width, height), (8, 12, 20, 210))
    im = Image.alpha_composite(bg, overlay)
    
    # Safe central area (1546 x 423) is y: 508 to 931, x: 507 to 2053
    # Center y = 720
    draw = ImageDraw.Draw(im)
    
    # Central glow
    glow = create_gradient_radial(width, height, (1280, 720), 500, (59, 130, 246, 90), (0, 0, 0, 0))
    im = Image.alpha_composite(im, glow)
    draw = ImageDraw.Draw(im)
    
    # Logo
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo = logo.resize((240, 240), Image.Resampling.LANCZOS)
        im.paste(logo, (640, 600), logo)
    
    font_title = get_font(92, bold=True)
    font_sub = get_font(38, bold=True)
    font_pills = get_font(24, bold=True)
    
    draw.text((920, 595), "YARGRAM", font=font_title, fill=(255, 255, 255))
    draw.text((924, 700), "ТВОЙ МЕССЕНДЖЕР. ТВОИ ПРАВИЛА.", font=font_sub, fill=(147, 197, 253))
    
    # Pill badges
    pills = [
        ("🚀 ЗБТ 0.0.1 ОТКРЫТО", (239, 68, 68), (254, 226, 226)),
        ("⚡ yargram.site", (37, 99, 235), (219, 234, 254)),
        ("💬 ЧАТЫ • ЗВОНКИ • СТИКЕРЫ", (16, 185, 129), (209, 250, 229)),
    ]
    px = 924
    py = 760
    for label, bg_color, text_color in pills:
        bbox = font_pills.getbbox(label)
        pw = (bbox[2] - bbox[0]) + 32
        ph = 44
        draw.rounded_rectangle([px, py, px + pw, py + ph], radius=22, fill=(*bg_color, 45), outline=(*bg_color, 120), width=2)
        draw.text((px + 16, py + 8), label, font=font_pills, fill=text_color)
        px += pw + 18
    
    out_path = os.path.join(OUTPUT_DIR, "channel_banner_2560x1440.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 3. VIDEO THUMBNAIL (1280x720)
# -------------------------------------------------------------
def generate_video_thumbnail():
    print("[3/4] Generating Video Thumbnail (1280x720)...")
    width, height = 1280, 720
    im = Image.new("RGBA", (width, height), (9, 13, 22, 255))
    
    # Radial glows
    g1 = create_gradient_radial(width, height, (960, 360), 450, (59, 130, 246, 110), (0, 0, 0, 0))
    g2 = create_gradient_radial(width, height, (200, 150), 350, (239, 68, 68, 80), (0, 0, 0, 0))
    im = Image.alpha_composite(im, g1)
    im = Image.alpha_composite(im, g2)
    
    draw = ImageDraw.Draw(im)
    
    # Left Content
    # 1. Hot Tag
    tag_font = get_font(26, bold=True)
    draw.rounded_rectangle([70, 75, 410, 125], radius=14, fill=(239, 68, 68, 240))
    draw.text((92, 85), "🔥 ГРАНДИОЗНЫЙ СТАРТ", font=tag_font, fill=(255, 255, 255))
    
    # 2. Main Title
    f_main = get_font(74, bold=True)
    draw.text((70, 150), "ОТКРЫТИЕ", font=f_main, fill=(255, 255, 255))
    
    f_zbt = get_font(98, bold=True)
    draw.text((70, 230), "ЗБТ 0.0.1", font=f_zbt, fill=(250, 204, 21)) # Gold / yellow
    
    f_brand = get_font(60, bold=True)
    draw.text((70, 345), "В YARGRAM!", font=f_brand, fill=(96, 165, 250))
    
    # 3. Features pills
    feat_font = get_font(24, bold=True)
    features = [
        "✓ Звонки и видеосвязь",
        "✓ Видеокружки и стикеры",
        "✓ Без цензуры и слежки",
        "✓ Вход открыт для всех!",
    ]
    fy = 440
    for feat in features:
        draw.text((72, fy), feat, font=feat_font, fill=(226, 232, 240))
        fy += 38
    
    # 4. Action Banner at bottom
    draw.rounded_rectangle([70, 610, 580, 665], radius=16, fill=(37, 99, 235, 255))
    f_btn = get_font(28, bold=True)
    draw.text((105, 622), "🌐 РЕГИСТРАЦИЯ: yargram.site", font=f_btn, fill=(255, 255, 255))
    
    # Right Side: Big Glowing Logo
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo = logo.resize((460, 460), Image.Resampling.LANCZOS)
        # Drop shadow
        shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(shadow)
        s_draw.ellipse([730, 140, 1170, 580], fill=(0, 0, 0, 160))
        shadow = shadow.filter(ImageFilter.GaussianBlur(30))
        im = Image.alpha_composite(im, shadow)
        im.paste(logo, (720, 130), logo)
    
    # Right Side Floating Badge
    b_font = get_font(22, bold=True)
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle([790, 540, 1110, 600], radius=16, fill=(15, 23, 42, 235), outline=(59, 130, 246, 160), width=2)
    draw.text((820, 555), "⚡ СКАЧИВАЙ И ТЕСТИРУЙ", font=b_font, fill=(255, 255, 255))
    
    out_path = os.path.join(OUTPUT_DIR, "video_thumbnail_1280x720.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 4. TEASER SOUNDTRACK SYNTHESIS (.WAV)
# -------------------------------------------------------------
def synthesize_soundtrack(duration_sec, sample_rate=44100):
    print(" -> Synthesizing electronic soundtrack...")
    num_samples = int(duration_sec * sample_rate)
    audio_path = os.path.join(OUTPUT_DIR, "soundtrack.wav")
    
    # Chord frequencies (Em, C, G, D progression)
    # E3=164.81, G3=196.00, B3=246.94
    chords = [
        [164.81, 196.00, 246.94, 329.63], # Em
        [130.81, 164.81, 196.00, 261.63], # C
        [196.00, 246.94, 293.66, 392.00], # G
        [146.83, 185.00, 220.00, 293.66], # D
    ]
    
    bpm = 120
    beat_dur = 60.0 / bpm # 0.5 sec
    chord_dur = beat_dur * 4 # 2.0 sec per chord
    
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        
        # Chord selection
        c_idx = int(t / chord_dur) % len(chords)
        chord = chords[c_idx]
        
        # Arpeggio (16th note arpeggiator)
        arp_step = int((t % (beat_dur)) / (beat_dur / 4)) % len(chord)
        freq_lead = chord[arp_step] * 2.0
        
        # Synth Lead sound (sawtooth-ish)
        lead = 0.15 * math.sin(2.0 * math.pi * freq_lead * t)
        lead += 0.07 * math.sin(4.0 * math.pi * freq_lead * t)
        
        # Bassline
        bass_freq = chord[0] * 0.5
        bass = 0.25 * math.sin(2.0 * math.pi * bass_freq * t)
        
        # Kick drum on every beat
        t_in_beat = t % beat_dur
        kick_freq = max(45.0, 160.0 * math.exp(-t_in_beat * 35.0))
        kick = 0.4 * math.sin(2.0 * math.pi * kick_freq * t_in_beat) * math.exp(-t_in_beat * 12.0)
        
        # Hi-hat on 16th notes
        t_in_16th = t % (beat_dur / 4)
        noise = (math.sin(t * 18451.23) + math.sin(t * 31415.92)) * 0.5
        hihat = 0.08 * noise * math.exp(-t_in_16th * 60.0)
        
        # Combine
        total = lead + bass + kick + hihat
        
        # Master fade in (1.5s) and fade out (2.0s)
        if t < 1.5:
            total *= (t / 1.5)
        elif t > duration_sec - 2.0:
            total *= max(0.0, (duration_sec - t) / 2.0)
            
        sample_val = int(max(-32767, min(32767, total * 26000)))
        samples.append(sample_val)
        
    with wave.open(audio_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        raw_data = struct.pack(f"<{len(samples)}h", *samples)
        wf.writeframes(raw_data)
        
    return audio_path

# -------------------------------------------------------------
# 5. VIDEO GENERATION (1920x1080 @ 30 FPS)
# -------------------------------------------------------------
def render_video():
    print("[4/4] Rendering Teaser Video (1920x1080 @ 30fps)...")
    fps = 30
    duration_sec = 24.0 # 24 seconds teaser
    total_frames = int(duration_sec * fps)
    
    width, height = 1920, 1080
    
    audio_file = synthesize_soundtrack(duration_sec)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    output_mp4 = os.path.join(OUTPUT_DIR, "yargram_zbt_001.mp4")
    
    # Load assets
    logo_orig = Image.open(LOGO_PATH).convert("RGBA") if os.path.exists(LOGO_PATH) else None
    
    f_huge = get_font(105, bold=True)
    f_title = get_font(78, bold=True)
    f_h2 = get_font(52, bold=True)
    f_body = get_font(38, bold=True)
    f_small = get_font(28, bold=False)
    
    # Launch ffmpeg process
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-", # Stdin pipe
        "-i", audio_file,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4
    ]
    # Pre-render background once for high-speed rendering
    print(" -> Pre-rendering background...")
    base_glow = create_gradient_radial(width, height, (960, 540), 520, (37, 99, 235, 80), (9, 13, 22, 255)).convert("RGBA")
    
    # Launch ffmpeg process with DEVNULL for stderr to prevent pipe buffer deadlock
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    # Pre-render scene logic
    for frame_idx in range(total_frames):
        t = frame_idx / fps # current time in seconds
        
        im = base_glow.copy()
        draw = ImageDraw.Draw(im)
        
        # Progress indicator line at top
        progress_w = int((t / duration_sec) * width)
        draw.rectangle([0, 0, progress_w, 6], fill=(59, 130, 246))
        
        # Scene 1: INTRO (0.0s - 4.5s)
        if t < 4.5:
            # Fade in
            fade = min(1.0, t / 1.0)
            if t > 3.8:
                fade = max(0.0, (4.5 - t) / 0.7)
            
            # Breathing logo
            logo_scale = 260 + int(12 * math.sin(t * 3.0))
            if logo_orig:
                l = logo_orig.resize((logo_scale, logo_scale), Image.Resampling.LANCZOS)
                im.paste(l, (960 - logo_scale // 2, 380 - logo_scale // 2), l)
            
            draw = ImageDraw.Draw(im)
            color_txt = (255, 255, 255, int(255 * fade))
            draw.text((740, 560), "YARGRAM", font=f_huge, fill=color_txt)
            draw.text((680, 680), "Новое поколение свободного общения", font=f_body, fill=(147, 197, 253, int(255 * fade)))

        # Scene 2: THE BIG ANNOUNCEMENT (4.5s - 9.5s)
        elif t < 9.5:
            st = t - 4.5 # scene time
            fade = min(1.0, st / 0.8)
            if t > 8.8:
                fade = max(0.0, (9.5 - t) / 0.7)
                
            # Badge
            draw.rounded_rectangle([720, 220, 1200, 280], radius=16, fill=(239, 68, 68, int(240 * fade)))
            draw.text((760, 232), "⚡ ДОЛГОЖДАННЫЙ СТАРТ", font=f_small, fill=(255, 255, 255, int(255 * fade)))
            
            # Big text
            draw.text((450, 320), "ОТКРЫТО ЗБТ 0.0.1!", font=f_huge, fill=(250, 204, 21, int(255 * fade)))
            draw.text((460, 470), "Закрытое бета-тестирование Yargram", font=f_h2, fill=(255, 255, 255, int(255 * fade)))
            draw.text((540, 550), "теперь доступно для всех желающих!", font=f_h2, fill=(147, 197, 253, int(255 * fade)))
            
            # Subcard
            draw.rounded_rectangle([520, 660, 1400, 750], radius=20, fill=(30, 41, 59, int(210 * fade)), outline=(59, 130, 246, int(150 * fade)), width=2)
            draw.text((580, 685), "Никаких инвайтов • Свободная регистрация", font=f_body, fill=(255, 255, 255, int(255 * fade)))

        # Scene 3: FEATURES (9.5s - 15.5s)
        elif t < 15.5:
            st = t - 9.5
            fade = min(1.0, st / 0.8)
            if t > 14.8:
                fade = max(0.0, (15.5 - t) / 0.7)
                
            draw.text((580, 140), "ЧТО УЖЕ РАБОТАЕТ В ЗБТ?", font=f_title, fill=(250, 204, 21, int(255 * fade)))
            
            features = [
                ("⚡", "Мгновенные чаты, группы и личные заметки"),
                ("📞", "HD Аудио- и видеозвонки с демонстрацией экрана"),
                ("🎥", "Видеокружки до 60 сек и голосовые сообщения"),
                ("🎨", "Живые видеофоны, кастомные темы и стикеры"),
                ("🔒", "Приватность звонков, защита и активные сеансы"),
            ]
            
            fy = 270
            for icon, label in features:
                draw.rounded_rectangle([380, fy, 1540, fy + 72], radius=16, fill=(19, 27, 46, int(200 * fade)), outline=(59, 130, 246, int(80 * fade)), width=1)
                draw.text((420, fy + 14), icon, font=f_body, fill=(255, 255, 255, int(255 * fade)))
                draw.text((490, fy + 16), label, font=f_body, fill=(241, 245, 249, int(255 * fade)))
                fy += 92

        # Scene 4: HOW TO JOIN (15.5s - 20.0s)
        elif t < 20.0:
            st = t - 15.5
            fade = min(1.0, st / 0.8)
            if t > 19.3:
                fade = max(0.0, (20.0 - t) / 0.7)
                
            draw.text((620, 160), "КАК НАЧАТЬ ОБЩАТЬСЯ?", font=f_title, fill=(255, 255, 255, int(255 * fade)))
            
            steps = [
                ("1", "Переходи на официальный сайт:", "https://yargram.site/app"),
                ("2", "Регистрируйся за 30 секунд:", "Нужен только email и пароль"),
                ("3", "Общайся и тестируй:", "Зови друзей по ссылке-приглашению!"),
            ]
            
            sy = 300
            for num, stitle, sdesc in steps:
                draw.rounded_rectangle([420, sy, 1500, sy + 105], radius=20, fill=(30, 41, 59, int(220 * fade)), outline=(37, 99, 235, int(150 * fade)), width=2)
                # Number circle
                draw.ellipse([450, sy + 22, 510, sy + 82], fill=(37, 99, 235, int(255 * fade)))
                draw.text((472, sy + 28), num, font=f_h2, fill=(255, 255, 255, int(255 * fade)))
                # Texts
                draw.text((540, sy + 20), stitle, font=f_body, fill=(255, 255, 255, int(255 * fade)))
                draw.text((540, sy + 62), sdesc, font=f_small, fill=(96, 165, 250, int(255 * fade)))
                sy += 128

        # Scene 5: OUTRO (20.0s - 24.0s)
        else:
            st = t - 20.0
            fade = min(1.0, st / 0.8)
            if t > 23.2:
                fade = max(0.0, (24.0 - t) / 0.8)
                
            if logo_orig:
                l = logo_orig.resize((220, 220), Image.Resampling.LANCZOS)
                im.paste(l, (850, 200), l)
                
            draw = ImageDraw.Draw(im)
            draw.text((740, 440), "YARGRAM", font=f_huge, fill=(255, 255, 255, int(255 * fade)))
            draw.text((640, 560), "Твой мессенджер. Твои правила.", font=f_h2, fill=(147, 197, 253, int(255 * fade)))
            
            draw.rounded_rectangle([520, 660, 1400, 740], radius=18, fill=(239, 68, 68, int(230 * fade)))
            draw.text((560, 680), "ПОДПИСЫВАЙСЯ И СТАВЬ ЛАЙК! 🔥", font=f_h2, fill=(255, 255, 255, int(255 * fade)))
            
            draw.text((680, 770), "Ссылка на сайт — в описании под видео", font=f_body, fill=(148, 163, 184, int(255 * fade)))

        # Convert to RGB and write raw bytes
        rgb_im = im.convert("RGB")
        proc.stdin.write(rgb_im.tobytes())
        
        if frame_idx % 90 == 0:
            print(f"  Frame {frame_idx}/{total_frames} ({int(frame_idx/total_frames*100)}%)...")

    proc.stdin.close()
    proc.wait()
    print(f" -> Video saved successfully: {output_mp4}")
    
    # Clean up temp wav
    try:
        os.remove(audio_file)
    except Exception:
        pass

if __name__ == "__main__":
    generate_channel_avatar()
    generate_channel_banner()
    generate_video_thumbnail()
    render_video()
    print("\nALL YOUTUBE ASSETS GENERATED SUCCESSFULLY!")
