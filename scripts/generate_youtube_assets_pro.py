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
SHOT_CHAT = os.path.abspath("runtime/screenshot-preview/shots-groups/02-переписка-группы.png")
SHOT_STICKERS = os.path.abspath("runtime/screenshot-preview/shots-stickers/01-переписка-стикеры-и-гифки.png")
SHOT_POLLS = os.path.abspath("runtime/screenshot-preview/shots-polls/03-опрос-в-переписке.png")

FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REGULAR = "C:/Windows/Fonts/segoeui.ttf"

def get_font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def draw_centered_text(draw, text, font, cy, fill, canvas_w=1920, stroke_fill=None, stroke_width=0):
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (canvas_w - w) // 2
    y = cy - h // 2
    draw.text((x, y), text, font=font, fill=fill, stroke_fill=stroke_fill, stroke_width=stroke_width)
    return x, y, w, h

def draw_badge(draw, cx, cy, text, font, bg_color, text_color, radius=14, pad_x=24, pad_y=10):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    bw = tw + pad_x * 2
    bh = th + pad_y * 2
    x0 = cx - bw // 2
    y0 = cy - bh // 2
    draw.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=radius, fill=bg_color)
    draw.text((x0 + pad_x, y0 + pad_y - 2), text, font=font, fill=text_color)
    return x0, y0, bw, bh

def create_window_mockup(shot_path, width, height, title="Yargram Web App"):
    bar_h = 36
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    # Body
    body_h = height - bar_h
    body = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    draw = ImageDraw.Draw(body)
    
    # Draw rounded container
    draw.rounded_rectangle([0, 0, width, height], radius=16, fill=(15, 23, 42, 255), outline=(59, 130, 246, 80), width=2)
    # Header bar
    draw.rounded_rectangle([0, 0, width, bar_h + 16], radius=16, fill=(30, 41, 59, 255))
    draw.rectangle([0, bar_h, width, height], fill=(15, 23, 42, 255))
    
    # Window buttons (mac-style dots)
    draw.ellipse([14, 12, 26, 24], fill=(239, 68, 68))
    draw.ellipse([34, 12, 46, 24], fill=(245, 158, 11))
    draw.ellipse([54, 12, 66, 24], fill=(16, 185, 129))
    
    # Title
    f_title = get_font(14, bold=True)
    t_bbox = f_title.getbbox(title)
    tw = t_bbox[2] - t_bbox[0]
    draw.text(((width - tw) // 2, 9), title, font=f_title, fill=(148, 163, 184))
    
    # Inner screenshot
    if os.path.exists(shot_path):
        shot = Image.open(shot_path).convert("RGBA")
        shot = shot.resize((width - 4, body_h - 4), Image.Resampling.LANCZOS)
        body.paste(shot, (2, bar_h + 2))
        
    return body

# -------------------------------------------------------------
# 1. CHANNEL AVATAR (800x800)
# -------------------------------------------------------------
def make_channel_avatar():
    print("[1/4] Generating Channel Avatar...")
    size = 800
    im = Image.new("RGBA", (size, size), (10, 14, 23, 255))
    draw = ImageDraw.Draw(im)
    
    # Concentric ambient glow
    for r in range(380, 100, -20):
        alpha = int(70 * (1.0 - r / 380))
        draw.ellipse([400 - r, 400 - r, 400 + r, 400 + r], fill=(59, 130, 246, alpha))
    
    # Sleek circular border ring
    draw.ellipse([50, 50, 750, 750], outline=(59, 130, 246, 140), width=4)
    draw.ellipse([64, 64, 736, 736], outline=(147, 51, 234, 60), width=2)
    
    # Centered Logo
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo = logo.resize((480, 480), Image.Resampling.LANCZOS)
        im.paste(logo, (160, 160), logo)
        
    out_path = os.path.join(OUTPUT_DIR, "channel_avatar_800x800.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 2. CHANNEL BANNER (2560x1440)
# -------------------------------------------------------------
def make_channel_banner():
    print("[2/4] Generating Channel Banner (2560x1440)...")
    width, height = 2560, 1440
    
    if os.path.exists(WALLPAPER_PATH):
        bg = Image.open(WALLPAPER_PATH).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
        bg = bg.filter(ImageFilter.GaussianBlur(14))
    else:
        bg = Image.new("RGBA", (width, height), (9, 13, 22, 255))
        
    overlay = Image.new("RGBA", (width, height), (8, 12, 20, 215))
    im = Image.alpha_composite(bg, overlay)
    draw = ImageDraw.Draw(im)
    
    # Safe area: Y=508..931 (center y = 720)
    # Left: Logo + Texts
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA").resize((220, 220), Image.Resampling.LANCZOS)
        im.paste(logo, (530, 610), logo)
        
    draw = ImageDraw.Draw(im)
    f_huge = get_font(88, bold=True)
    f_sub = get_font(36, bold=True)
    f_badge = get_font(22, bold=True)
    
    draw.text((790, 605), "YARGRAM", font=f_huge, fill=(255, 255, 255))
    draw.text((795, 705), "ТВОЙ МЕССЕНДЖЕР. ТВОИ ПРАВИЛА.", font=f_sub, fill=(147, 197, 253))
    
    draw_badge(draw, 910, 785, "🔥 ЗБТ 0.0.1 ОТКРЫТО", f_badge, (239, 68, 68), (255, 255, 255))
    draw_badge(draw, 1160, 785, "🌐 yargram.site", f_badge, (37, 99, 235), (255, 255, 255))
    draw_badge(draw, 1420, 785, "💬 ЧАТЫ • ЗВОНКИ • СТИКЕРЫ", f_badge, (16, 185, 129), (255, 255, 255))
    
    # Right: Real app window mockup
    mockup = create_window_mockup(SHOT_CHAT, 460, 290, "Yargram Desktop")
    im.paste(mockup, (1580, 575), mockup)
    
    out_path = os.path.join(OUTPUT_DIR, "channel_banner_2560x1440.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 3. VIDEO THUMBNAIL (1280x720)
# -------------------------------------------------------------
def make_video_thumbnail():
    print("[3/4] Generating Video Thumbnail (1280x720)...")
    W, H = 1280, 720
    im = Image.new("RGBA", (W, H), (10, 14, 23, 255))
    draw = ImageDraw.Draw(im)
    
    # Ambient glows
    for r in range(400, 100, -30):
        draw.ellipse([850 - r, 360 - r, 850 + r, 360 + r], fill=(37, 99, 235, int(50 * (1 - r / 400))))
        draw.ellipse([200 - r, 150 - r, 200 + r, 150 + r], fill=(239, 68, 68, int(40 * (1 - r / 400))))
        
    # Right Side: Modern Desktop App Window with drop shadow
    mock_w, mock_h = 620, 460
    mockup = create_window_mockup(SHOT_CHAT, mock_w, mock_h, "Yargram • Групповые чаты и звонки")
    
    # Drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([610, 130, 610 + mock_w, 130 + mock_h], radius=24, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(25))
    im = Image.alpha_composite(im, shadow)
    
    im.paste(mockup, (620, 130), mockup)
    
    # Logo floating on top of window
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA").resize((120, 120), Image.Resampling.LANCZOS)
        im.paste(logo, (570, 80), logo)
    
    draw = ImageDraw.Draw(im)
    
    # Left Content: Bold, beautifully formatted text
    # 1. Hot status tag
    f_tag = get_font(24, bold=True)
    draw_badge(draw, 240, 85, "🔴 ГРАНДИОЗНЫЙ СТАРТ", f_tag, (239, 68, 68), (255, 255, 255), radius=12, pad_x=20, pad_y=8)
    
    # 2. Main Announcement
    f_huge1 = get_font(72, bold=True)
    draw.text((70, 140), "ОТКРЫТИЕ", font=f_huge1, fill=(255, 255, 255), stroke_fill=(0, 0, 0), stroke_width=3)
    
    f_huge2 = get_font(92, bold=True)
    draw.text((70, 225), "ЗБТ 0.0.1", font=f_huge2, fill=(250, 204, 21), stroke_fill=(0, 0, 0), stroke_width=4)
    
    f_brand = get_font(56, bold=True)
    draw.text((70, 340), "В YARGRAM!", font=f_brand, fill=(96, 165, 250), stroke_fill=(0, 0, 0), stroke_width=2)
    
    # 3. Checkmarks
    f_chk = get_font(24, bold=True)
    items = [
        "⚡ Без инвайтов — вход открыт всем",
        "📞 HD Аудио- и видеозвонки",
        "🎥 Видеокружки, опросы и стикеры",
    ]
    cy = 445
    for item in items:
        draw.text((72, cy), item, font=f_chk, fill=(226, 232, 240))
        cy += 40
        
    # 4. Action CTA Button
    f_cta = get_font(26, bold=True)
    draw.rounded_rectangle([70, 595, 540, 660], radius=16, fill=(37, 99, 235), outline=(96, 165, 250), width=2)
    draw.text((105, 612), "🌐 РЕГИСТРАЦИЯ: yargram.site", font=f_cta, fill=(255, 255, 255))
    
    out_path = os.path.join(OUTPUT_DIR, "video_thumbnail_1280x720.png")
    im.save(out_path, "PNG")
    print(f" -> Saved: {out_path}")

# -------------------------------------------------------------
# 4. SOUNDTRACK SYNTHESIS
# -------------------------------------------------------------
def make_soundtrack(duration_sec, sample_rate=44100):
    audio_path = os.path.join(OUTPUT_DIR, "soundtrack.wav")
    num_samples = int(duration_sec * sample_rate)
    
    # Electronic progression (Am, F, C, G)
    chords = [
        [220.00, 261.63, 329.63, 440.00], # Am
        [174.61, 220.00, 261.63, 349.23], # F
        [130.81, 164.81, 196.00, 261.63], # C
        [196.00, 246.94, 293.66, 392.00], # G
    ]
    
    bpm = 124
    beat_dur = 60.0 / bpm
    chord_dur = beat_dur * 4
    
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        c_idx = int(t / chord_dur) % len(chords)
        chord = chords[c_idx]
        
        # 16th note arp
        step = int((t % beat_dur) / (beat_dur / 4)) % len(chord)
        freq = chord[step] * 1.5
        
        lead = 0.16 * math.sin(2.0 * math.pi * freq * t) + 0.08 * math.sin(4.0 * math.pi * freq * t)
        bass = 0.28 * math.sin(2.0 * math.pi * (chord[0] * 0.5) * t)
        
        # Punchy kick on beat
        tb = t % beat_dur
        kick_freq = max(45.0, 180.0 * math.exp(-tb * 40.0))
        kick = 0.45 * math.sin(2.0 * math.pi * kick_freq * tb) * math.exp(-tb * 14.0)
        
        # Snare / clap on beats 2 and 4
        snare_time = (t - beat_dur) % (beat_dur * 2)
        snare = 0.0
        if snare_time < 0.2:
            noise = (math.sin(t * 19283.4) + math.sin(t * 38192.1)) * 0.5
            snare = 0.18 * noise * math.exp(-snare_time * 25.0)
            
        total = lead + bass + kick + snare
        if t < 1.2:
            total *= (t / 1.2)
        elif t > duration_sec - 1.8:
            total *= max(0.0, (duration_sec - t) / 1.8)
            
        sample_val = int(max(-32767, min(32767, total * 25000)))
        samples.append(sample_val)
        
    with wave.open(audio_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        
    return audio_path

# -------------------------------------------------------------
# 5. CINEMATIC VIDEO (1920x1080 @ 30 FPS)
# -------------------------------------------------------------
def make_video():
    print("[4/4] Rendering Cinematic Teaser Video...")
    fps = 30
    duration_sec = 26.0
    total_frames = int(duration_sec * fps)
    W, H = 1920, 1080
    
    audio_file = make_soundtrack(duration_sec)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    output_mp4 = os.path.join(OUTPUT_DIR, "yargram_zbt_001.mp4")
    
    # Fonts
    f_huge = get_font(96, bold=True)
    f_title = get_font(64, bold=True)
    f_h2 = get_font(42, bold=True)
    f_body = get_font(32, bold=True)
    f_badge = get_font(24, bold=True)
    
    # Pre-render base background
    bg_base = Image.new("RGBA", (W, H), (9, 13, 22, 255))
    bg_draw = ImageDraw.Draw(bg_base)
    for r in range(650, 150, -40):
        bg_draw.ellipse([960 - r, 540 - r, 960 + r, 540 + r], fill=(37, 99, 235, int(45 * (1 - r / 650))))
        
    # Pre-render window mockups
    mock_chat = create_window_mockup(SHOT_CHAT, 1280, 720, "Yargram • Групповой чат и переписка")
    mock_stickers = create_window_mockup(SHOT_STICKERS, 1280, 720, "Yargram • Стикеры, реакции и GIF")
    mock_polls = create_window_mockup(SHOT_POLLS, 1280, 720, "Yargram • Опросы, викторины и звонки")
    logo_img = Image.open(LOGO_PATH).convert("RGBA") if os.path.exists(LOGO_PATH) else None
    
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
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
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    for frame_idx in range(total_frames):
        t = frame_idx / fps
        im = bg_base.copy()
        draw = ImageDraw.Draw(im)
        
        # Top progress bar
        prog_w = int((t / duration_sec) * W)
        draw.rectangle([0, 0, prog_w, 6], fill=(59, 130, 246))
        
        # ---------------- SCENE 1: CINEMATIC INTRO (0.0s - 4.5s) ----------------
        if t < 4.5:
            fade = min(1.0, t / 1.0)
            if t > 3.8:
                fade = max(0.0, (4.5 - t) / 0.7)
                
            scale = int(240 + 10 * math.sin(t * 2.5))
            if logo_img:
                l = logo_img.resize((scale, scale), Image.Resampling.LANCZOS)
                im.paste(l, (960 - scale // 2, 340 - scale // 2), l)
                
            draw = ImageDraw.Draw(im)
            draw_centered_text(draw, "YARGRAM", f_huge, 540, (255, 255, 255, int(255 * fade)))
            draw_centered_text(draw, "Новый независимый веб-мессенджер", f_h2, 630, (147, 197, 253, int(255 * fade)))
            draw_badge(draw, 960, 720, "⚡ ВЕРСИЯ 0.0.1", f_badge, (37, 99, 235, int(240 * fade)), (255, 255, 255, int(255 * fade)))

        # ---------------- SCENE 2: ANNOUNCEMENT + GROUP CHATS (4.5s - 10.5s) ----------------
        elif t < 10.5:
            st = t - 4.5
            fade = min(1.0, st / 0.7)
            if t > 9.8:
                fade = max(0.0, (10.5 - t) / 0.7)
                
            # Header
            draw_badge(draw, 960, 60, "🔥 ЗАКРЫТОЕ БЕТА-ТЕСТИРОВАНИЕ", f_badge, (239, 68, 68), (255, 255, 255))
            draw_centered_text(draw, "ОТКРЫТИЕ ЗБТ 0.0.1", f_title, 125, (250, 204, 21))
            draw_centered_text(draw, "Мгновенные сообщения, группы и каналы связи", f_h2, 185, (226, 232, 240))
            
            # App Window Mockup with subtle sliding motion
            slide_y = int(230 + (1.0 - fade) * 60)
            im.paste(mock_chat, (320, slide_y), mock_chat)

        # ---------------- SCENE 3: STICKERS & REACTIONS (10.5s - 16.0s) ----------------
        elif t < 16.0:
            st = t - 10.5
            fade = min(1.0, st / 0.7)
            if t > 15.3:
                fade = max(0.0, (16.0 - t) / 0.7)
                
            draw_badge(draw, 960, 60, "🎨 ЭМОЦИИ И МЕДИА", f_badge, (16, 185, 129), (255, 255, 255))
            draw_centered_text(draw, "СТИКЕРЫ, ВИДЕОКРУЖКИ И РЕАКЦИИ", f_title, 125, (255, 255, 255))
            draw_centered_text(draw, "Встроенные паки, видеосообщения до 60 сек и реакция в 1 клик", f_h2, 185, (147, 197, 253))
            
            slide_y = int(230 + (1.0 - fade) * 60)
            im.paste(mock_stickers, (320, slide_y), mock_stickers)

        # ---------------- SCENE 4: POLLS & CALLS (16.0s - 21.5s) ----------------
        elif t < 21.5:
            st = t - 16.0
            fade = min(1.0, st / 0.7)
            if t > 20.8:
                fade = max(0.0, (21.5 - t) / 0.7)
                
            draw_badge(draw, 960, 60, "📊 ИНТЕРАКТИВ И СВЯЗЬ", f_badge, (147, 51, 234), (255, 255, 255))
            draw_centered_text(draw, "ОПРОСЫ, ВИКТОРИНЫ И HD ЗВОНКИ", f_title, 125, (255, 255, 255))
            draw_centered_text(draw, "Анонимные голосования и бесплатные звонки с демонстрацией экрана", f_h2, 185, (226, 232, 240))
            
            slide_y = int(230 + (1.0 - fade) * 60)
            im.paste(mock_polls, (320, slide_y), mock_polls)

        # ---------------- SCENE 5: CALL TO ACTION (21.5s - 26.0s) ----------------
        else:
            st = t - 21.5
            fade = min(1.0, st / 0.8)
            if t > 25.2:
                fade = max(0.0, (26.0 - t) / 0.8)
                
            if logo_img:
                scale = 180
                l = logo_img.resize((scale, scale), Image.Resampling.LANCZOS)
                im.paste(l, (960 - scale // 2, 200), l)
                
            draw = ImageDraw.Draw(im)
            draw_centered_text(draw, "ВХОД ОТКРЫТ ДЛЯ ВСЕХ!", f_huge, 430, (250, 204, 21))
            draw_centered_text(draw, "Тестируй прямо сейчас в любом браузере:", f_h2, 520, (255, 255, 255))
            
            # Big Glowing URL Card
            draw.rounded_rectangle([560, 580, 1360, 680], radius=24, fill=(37, 99, 235), outline=(96, 165, 250), width=3)
            draw_centered_text(draw, "🌐 https://yargram.site/app", f_title, 630, (255, 255, 255))
            
            draw_centered_text(draw, "Подпишись на канал и зови друзей! 🔥", f_h2, 750, (147, 197, 253))
            
        rgb = im.convert("RGB")
        proc.stdin.write(rgb.tobytes())
        
        if frame_idx % 90 == 0:
            print(f"  Frame {frame_idx}/{total_frames} ({int(frame_idx/total_frames*100)}%)...")
            sys.stdout.flush()
            
    proc.stdin.close()
    proc.wait()
    print(f" -> Video saved: {output_mp4}")
    try:
        os.remove(audio_file)
    except Exception:
        pass

if __name__ == "__main__":
    make_channel_avatar()
    make_channel_banner()
    make_video_thumbnail()
    make_video()
    print("\nALL PROFESSIONAL ASSETS READY!")
