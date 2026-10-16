# -*- coding: utf-8 -*-
"""Генератор встроенных стикеров Yargram.

Рисует три набора плоским «эмодзи-» стилем: жёлтые лица, зверята, реакции.
Статика — PNG 512×512 с прозрачностью, анимация — WebP 256×256 (14–20 кадров),
как уже лежит в наборе Yargram.

Запуск (Pillow нужен только для этой правки, в зависимости проекта не входит):
    python scripts/make_builtin_stickers.py

🔥 Стиль держится на трёх вещах: суперсэмплинг 4× (рисуем на 2048, ужимаем
до 512 — края остаются гладкими), мягкая засветка/тень по маске прозрачности
(лицо выглядит объёмным, а не наклейкой) и толстые тёмные черты лица.
"""
from __future__ import annotations

import math
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

S = 512
SS = 4
C = S * SS
OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "stickers")

YELLOW = (255, 201, 60, 255)
YELLOW_SICK = (198, 214, 108, 255)
GRAY = (158, 168, 180, 255)
WHITE = (246, 248, 251, 255)
INK = (38, 32, 24, 255)
RED = (226, 68, 62, 255)
PINK = (244, 143, 177, 255)
BLUE = (86, 152, 233, 255)
GREEN = (98, 182, 96, 255)
BROWN = (150, 100, 60, 255)


def newc() -> Image.Image:
    return Image.new("RGBA", (C, C), (0, 0, 0, 0))


def sc(v: float) -> int:
    return int(round(v * SS))


def ell(d: ImageDraw.ImageDraw, cx, cy, rx, ry, fill, outline=None, w=0):
    d.ellipse([sc(cx - rx), sc(cy - ry), sc(cx + rx), sc(cy + ry)],
              fill=fill, outline=outline, width=sc(w))


def rrect(d: ImageDraw.ImageDraw, x0, y0, x1, y1, r, fill, outline=None, w=0):
    d.rounded_rectangle([sc(x0), sc(y0), sc(x1), sc(y1)], radius=sc(r),
                        fill=fill, outline=outline, width=sc(w))


def poly(d: ImageDraw.ImageDraw, points, fill, outline=None, w=0):
    d.polygon([(sc(x), sc(y)) for x, y in points], fill=fill, outline=outline, width=sc(w))


def line(d: ImageDraw.ImageDraw, points, fill, w):
    d.line([(sc(x), sc(y)) for x, y in points], fill=fill, width=sc(w), joint="curve")


def arc(d: ImageDraw.ImageDraw, cx, cy, rx, ry, a0, a1, fill, w):
    d.arc([sc(cx - rx), sc(cy - ry), sc(cx + rx), sc(cy + ry)], a0, a1, fill=fill, width=sc(w))


def heart(d: ImageDraw.ImageDraw, cx, cy, r, fill):
    ell(d, cx - r * 0.5, cy - r * 0.35, r * 0.55, r * 0.5, fill)
    ell(d, cx + r * 0.5, cy - r * 0.35, r * 0.55, r * 0.5, fill)
    poly(d, [(cx - r * 1.02, cy - r * 0.05), (cx + r * 1.02, cy - r * 0.05), (cx, cy + r * 1.05)], fill)


def star(d: ImageDraw.ImageDraw, cx, cy, r, fill, rot=-90):
    pts = []
    for i in range(10):
        rad = r if i % 2 == 0 else r * 0.45
        a = math.radians(rot + i * 36)
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    poly(d, pts, fill)


def shade(img: Image.Image, strength=0.30) -> Image.Image:
    """Мягкая засветка сверху-слева и тень снизу-справа по маске фигуры."""
    alpha = img.getchannel("A")
    grad = ImageOps.invert(Image.radial_gradient("L").resize((C, C), Image.BILINEAR))
    light = ImageChops.multiply(grad.point(lambda v: int(v * strength)), alpha)
    dark = ImageChops.multiply(grad.resize((C, C)).point(lambda v: int(v * strength * 0.8)), alpha)
    img.paste((255, 255, 255), (0, 0), light)
    img.paste((150, 95, 20), (0, 0), dark)
    return img


def face_base(fill=YELLOW, cx=256, cy=270, r=195) -> Image.Image:
    img = newc()
    d = ImageDraw.Draw(img, "RGBA")
    ell(d, cx, cy, r, r, fill)
    shade(img)
    return img


def features(img: Image.Image) -> ImageDraw.ImageDraw:
    return ImageDraw.Draw(img, "RGBA")


def eyes_open(d, cx=256, cy=250, gap=72, r=25, pupil=True):
    for s in (-1, 1):
        x = cx + s * gap
        ell(d, x, cy, r, r * 1.3, INK)
        if pupil:
            ell(d, x - r * 0.28, cy - r * 0.45, r * 0.3, r * 0.3, (255, 255, 255, 235))


def eyes_happy(d, cx=256, cy=252, gap=72, w=17):
    for s in (-1, 1):
        arc(d, cx + s * gap, cy + 10, 34, 30, 180, 360, INK, w)


def eyes_closed_down(d, cx=256, cy=252, gap=72, w=16):
    for s in (-1, 1):
        arc(d, cx + s * gap, cy - 6, 34, 28, 0, 180, INK, w)


def mouth_smile(d, cx=256, cy=310, rx=78, ry=52, w=17):
    arc(d, cx, cy, rx, ry, 15, 165, INK, w)


def mouth_open(d, cx=256, cy=312, rx=82, ry=62):
    ell(d, cx, cy + ry * 0.15, rx, ry, INK)
    # язык
    ell(d, cx, cy + ry * 0.85, rx * 0.62, ry * 0.42, (240, 110, 120, 255))
    # зубы
    rrect(d, cx - rx * 0.72, cy - ry * 0.62, cx + rx * 0.72, cy - ry * 0.2, 10, (255, 255, 255, 255))


def mouth_frown(d, cx=256, cy=350, rx=64, ry=42, w=16):
    arc(d, cx, cy, rx, ry, 195, 345, INK, w)


def mouth_small_o(d, cx=256, cy=320, r=30):
    ell(d, cx, cy, r, r * 1.25, INK)


def mouth_flat(d, cx=256, cy=322, w=72, th=15):
    line(d, [(cx - w, cy), (cx + w, cy)], INK, th)


def mouth_wave(d, cx=256, cy=325, w=70, amp=12, th=15):
    pts = [(cx - w + i * (2 * w / 8), cy + (amp if i % 2 else -amp)) for i in range(9)]
    line(d, pts, INK, th)


def blush(d, cx=256, cy=300, gap=125, r=34):
    for s in (-1, 1):
        ell(d, cx + s * gap, cy, r, r * 0.68, (244, 122, 132, 110))


def tear(d, cx, cy, r=22):
    ell(d, cx, cy, r * 0.8, r * 1.15, BLUE)
    poly(d, [(cx - r * 0.75, cy - r * 0.2), (cx + r * 0.75, cy - r * 0.2), (cx, cy - r * 2.1)], BLUE)


def zzz(d, x=388, y=150, size=64, fill=(120, 140, 190, 255)):
    for i in range(3):
        s = size * (1 - i * 0.22)
        ox, oy = x + i * 44, y - i * 52
        th = max(8, int(s * 0.16))
        line(d, [(ox, oy), (ox + s, oy), (ox, oy + s), (ox + s, oy + s)], fill, th)


def save(img: Image.Image, rel: str):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((S, S), Image.LANCZOS).save(path, "PNG", optimize=True)
    return path


def anim(base: Image.Image, frames, rel: str, duration=90):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    small = base.resize((256, 256), Image.LANCZOS)
    frames[0].save(path, "WEBP", save_all=True, append_images=frames[1:],
                   duration=duration, loop=0, method=4)
    return path


def scaled(base: Image.Image, k: float) -> Image.Image:
    size = max(1, int(256 * k))
    small = base.resize((256, 256), Image.LANCZOS)
    out = small.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    canvas.paste(out, ((256 - size) // 2, (256 - size) // 2), out)
    return canvas


def pulse_frames(base: Image.Image, n=16, amp=0.10):
    return [scaled(base, 1 + amp * math.sin(i / n * 2 * math.pi)) for i in range(n)]


def spin_frames(base: Image.Image, n=20):
    small = base.resize((256, 256), Image.LANCZOS)
    return [small.rotate(-i * 360 / n, resample=Image.BICUBIC) for i in range(n)]


def flicker_frames(base: Image.Image, n=14):
    small = base.resize((256, 256), Image.LANCZOS)
    out = []
    for i in range(n):
        k = 1 + 0.06 * math.sin(i / n * 4 * math.pi)
        h = int(256 * k)
        f = small.resize((256, h), Image.LANCZOS)
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        canvas.paste(f, (0, 256 - h), f)
        out.append(canvas)
    return out


def bounce_frames(base: Image.Image, n=16, amp=10):
    small = base.resize((256, 256), Image.LANCZOS)
    return [small.copy().transform((256, 256), Image.AFFINE,
                                   (1, 0, 0, 0, 1, -amp * math.sin(i / n * 2 * math.pi)))
            for i in range(n)]


def twinkle_frames(base: Image.Image, n=14):
    out = []
    for i in range(n):
        k = 1 + 0.12 * math.sin(i / n * 2 * math.pi)
        f = scaled(base, k)
        out.append(f.rotate(6 * math.sin(i / n * 2 * math.pi), resample=Image.BICUBIC))
    return out


def pick_font(size: int) -> ImageFont.FreeTypeFont:
    # Impact есть не везде;Verdana — запасной шрифт с кириллицей.
    for name in ("impact.ttf", "verdanab.ttf", "arialbd.ttf"):
        try:
            font = ImageFont.truetype(os.path.join("C:\\Windows\\Fonts", name), size * SS)
            box = font.getbbox("Привет")
            if box and box[2] > 0:
                return font
        except OSError:
            continue
    return ImageFont.load_default()


def text_sticker(text: str, fill=(255, 255, 255, 255), outline=INK) -> Image.Image:
    img = newc()
    d = ImageDraw.Draw(img, "RGBA")
    font = pick_font(190 if len(text) <= 3 else 132)
    box = d.textbbox((0, 0), text, font=font, stroke_width=sc(18))
    w, h = box[2] - box[0], box[3] - box[1]
    x, y = (C - w) // 2 - box[0], (C - h) // 2 - box[1]
    d.text((x, y), text, font=font, fill=fill, stroke_width=sc(18), stroke_fill=outline)
    return img


# ---------------------------------------------------------------- набор «Смайлы»

def smiles() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}

    def base(**kw):
        return face_base(**kw)

    img = base(); d = features(img); eyes_open(d); mouth_smile(d); blush(d)
    out["smile"] = img

    img = base(); d = features(img); eyes_happy(d); mouth_open(d)
    out["laugh"] = img

    img = base(); d = features(img); eyes_open(d, gap=72)
    arc(d, 256 + 72, 262, 34, 30, 180, 360, INK, 17); mouth_smile(d); blush(d)
    out["wink"] = img

    img = base(); d = features(img); eyes_open(d, r=22)
    line(d, [(150, 205), (200, 225)], INK, 14); line(d, [(362, 205), (312, 225)], INK, 14)
    mouth_frown(d)
    out["sad"] = img

    img = base(); d = features(img); eyes_closed_down(d); mouth_frown(d, cy=340)
    tear(d, 176, 300); tear(d, 336, 300)
    out["cry"] = img

    img = base(); d = features(img)
    eyes_open(d, r=20); mouth_frown(d, cy=345, rx=54)
    line(d, [(140, 190), (205, 212)], INK, 16); line(d, [(372, 190), (307, 212)], INK, 16)
    line(d, [(330, 150), (368, 138)], (214, 60, 50, 255), 12)
    line(d, [(340, 175), (382, 172)], (214, 60, 50, 255), 12)
    line(d, [(352, 128), (352, 165)], (214, 60, 50, 255), 12)
    out["angry"] = img

    img = base(); d = features(img)
    eyes_open(d, gap=70, r=32); mouth_small_o(d, r=28)
    out["surprised"] = img

    img = base(); d = features(img); eyes_closed_down(d)
    ell(d, 240, 330, 26, 20, INK); ell(d, 272, 330, 26, 20, INK)
    heart(d, 372, 176, 34, RED); blush(d)
    out["kiss"] = img

    img = base(); d = features(img)
    eyes_open(d, gap=70, r=22); mouth_flat(d, w=52)
    ell(d, 352, 220, 10, 10, (120, 120, 120, 220)); ell(d, 380, 200, 13, 13, (120, 120, 120, 220))
    ell(d, 412, 176, 17, 17, (120, 120, 120, 220))
    out["think"] = img

    img = base(); d = features(img); eyes_closed_down(d)
    ell(d, 256, 330, 24, 22, INK); zzz(d, 372, 168, 58)
    out["sleep"] = img

    img = base(); d = features(img)
    rrect(d, 138, 218, 374, 278, 22, INK)
    ell(d, 256, 300, 40, 22, (255, 255, 255, 40)); mouth_smile(d, cy=340, rx=56, ry=34, w=15)
    out["cool"] = img

    img = base(); d = features(img); eyes_happy(d); mouth_open(d)
    tear(d, 150, 300, 24); tear(d, 362, 300, 24)
    out["joy"] = img

    img = base(); d = features(img); eyes_open(d, r=23); mouth_smile(d, rx=64, ry=40)
    blush(d, cy=302, r=44)
    out["shy"] = img

    img = base(); d = features(img); eyes_open(d, r=24)
    mouth_open(d, rx=64, ry=48)
    ell(d, 256, 372, 42, 30, (244, 120, 132, 255))
    out["tongue"] = img

    img = base(); d = features(img); eyes_open(d, r=22, pupil=False)
    ell(d, 238, 254, 9, 9, (255, 255, 255, 255)); ell(d, 310, 254, 9, 9, (255, 255, 255, 255))
    mouth_flat(d, w=56)
    out["neutral"] = img

    img = base(); d = features(img)
    eyes_open(d, gap=70, r=34, pupil=False)
    ell(d, 232, 252, 13, 13, INK); ell(d, 324, 252, 13, 13, INK)
    mouth_wave(d, cy=330, w=52, amp=10)
    ell(d, 352, 176, 20, 28, (140, 200, 245, 220))
    out["scared"] = img

    img = face_base(YELLOW_SICK); d = features(img)
    eyes_closed_down(d); mouth_wave(d, cy=330, w=58, amp=11)
    ell(d, 348, 168, 20, 27, (120, 190, 235, 230))
    out["sick"] = img

    img = newc(); d = features(img)
    rrect(d, 118, 178, 394, 402, 46, GRAY); shade(img)
    d = features(img)
    ell(d, 256, 152, 12, 12, INK); line(d, [(256, 162), (256, 182)], INK, 9)
    rrect(d, 156, 218, 356, 320, 20, (46, 52, 60, 255))
    ell(d, 206, 268, 22, 22, (120, 220, 245, 255)); ell(d, 306, 268, 22, 22, (120, 220, 245, 255))
    for i in range(4):
        line(d, [(190 + i * 44, 344), (190 + i * 44, 380)], INK, 10)
    out["robot"] = img

    img = newc(); d = features(img)
    poly(d, [(140, 420), (140, 260), (170, 150), (256, 110), (342, 150), (372, 260), (372, 420)], WHITE)
    ell(d, 256, 160, 118, 96, WHITE)
    for i in range(5):
        x = 150 + i * 53
        poly(d, [(x, 420), (x + 26, 462), (x + 52, 420)], WHITE)
    shade(img); d = features(img)
    eyes_open(d, gap=64, r=22); mouth_small_o(d, cy=320, r=26)
    out["ghost"] = img

    img = base(); d = features(img)
    heart(d, 184, 246, 46, RED); heart(d, 328, 246, 46, RED)
    mouth_smile(d, cy=318, rx=62, ry=42); blush(d)
    out["in-love"] = img

    img = base(); d = features(img)
    star(d, 182, 246, 46, (255, 214, 90, 255), rot=-90); star(d, 330, 246, 46, (255, 214, 90, 255), rot=-90)
    mouth_open(d, rx=70, ry=52)
    out["star-eyes"] = img

    img = base(); d = features(img)
    for s in (-1, 1):
        x = 256 + s * 72
        line(d, [(x - 24, 226), (x + 24, 274)], INK, 14)
        line(d, [(x + 24, 226), (x - 24, 274)], INK, 14)
    mouth_wave(d, cy=330, w=58, amp=12)
    arc(d, 130, 170, 34, 34, 200, 340, (150, 150, 150, 200), 9)
    arc(d, 392, 170, 34, 34, 200, 340, (150, 150, 150, 200), 9)
    out["dizzy"] = img

    img = base(); d = features(img); eyes_happy(d); mouth_open(d)
    poly(d, [(168, 178), (256, 40), (344, 178)], (83, 74, 183, 255))
    ell(d, 256, 42, 26, 26, (255, 214, 90, 255))
    for i, col in enumerate([RED, BLUE, GREEN, PINK]):
        a = math.radians(-150 + i * 42)
        ell(d, 256 + 190 * math.cos(a), 260 + 190 * math.sin(a), 11, 11, col)
    out["party"] = img

    img = base(); d = features(img)
    eyes_open(d, r=21)
    arc(d, 292, 322, 62, 40, 20, 160, INK, 16)
    line(d, [(320, 214), (376, 200)], INK, 13)
    out["smirk"] = img

    return out


SMILE_EMOJI = {
    "smile": "😀", "laugh": "😄", "wink": "😉", "sad": "😔", "cry": "😢", "angry": "😠",
    "surprised": "😲", "kiss": "😘", "think": "🤔", "sleep": "😴", "cool": "😎", "joy": "😂",
    "shy": "😊", "tongue": "😜", "neutral": "😐", "scared": "😨", "sick": "🤢", "robot": "🤖",
    "ghost": "👻", "in-love": "😍", "star-eyes": "🤩", "dizzy": "😵", "party": "🎉", "smirk": "😏",
}


# ---------------------------------------------------------------- набор «Зверята»

def animals() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}

    def head(fill, ear_fill=None, cx=256, cy=280, r=170):
        img = newc()
        d = ImageDraw.Draw(img, "RGBA")
        f = ear_fill or fill
        return img, d, f

    # кот
    img, d, f = head(YELLOW)
    poly(d, [(110, 250), (128, 96), (232, 190)], f); poly(d, [(402, 250), (384, 96), (280, 190)], f)
    ell(d, 256, 290, 172, 162, f); shade(img); d = features(img)
    eyes_open(d, cy=270, gap=66, r=21)
    poly(d, [(256, 312), (232, 296), (280, 296)], (244, 143, 177, 255))
    for s in (-1, 1):
        line(d, [(256 + s * 34, 316), (256 + s * 66, 330)], INK, 8)
        for dy in (-14, 0, 14):
            line(d, [(256 + s * 92, 306 + dy), (256 + s * 150, 300 + dy * 1.4)], INK, 7)
    out["cat"] = img

    # собака
    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 122, 300, 62, 118, (178, 132, 84, 255)); ell(d, 390, 300, 62, 118, (178, 132, 84, 255))
    ell(d, 256, 290, 168, 158, (226, 182, 126, 255)); shade(img); d = features(img)
    eyes_open(d, cy=262, gap=64, r=21)
    ell(d, 256, 330, 44, 34, INK)
    ell(d, 256, 386, 24, 18, (240, 130, 140, 255))
    out["dog"] = img

    # лиса
    img, d, f = head((240, 140, 60, 255))
    poly(d, [(104, 246), (122, 84), (236, 184)], f); poly(d, [(408, 246), (390, 84), (276, 184)], f)
    ell(d, 256, 288, 170, 158, f); shade(img); d = features(img)
    eyes_open(d, cy=262, gap=62, r=20)
    poly(d, [(256, 420), (160, 340), (256, 306), (352, 340)], WHITE)
    ell(d, 256, 318, 22, 16, INK)
    out["fox"] = img

    # медведь
    img, d, f = head((176, 124, 82, 255))
    ell(d, 138, 152, 52, 52, f); ell(d, 374, 152, 52, 52, f)
    ell(d, 256, 288, 172, 164, f); shade(img); d = features(img)
    eyes_open(d, cy=256, gap=64, r=21)
    ell(d, 256, 344, 62, 52, (232, 208, 178, 255))
    ell(d, 256, 328, 26, 19, INK)
    arc(d, 256, 356, 30, 24, 20, 160, INK, 9)
    out["bear"] = img

    # панда
    img, d, f = head(WHITE)
    ell(d, 138, 150, 54, 54, INK); ell(d, 374, 150, 54, 54, INK)
    ell(d, 256, 288, 172, 164, WHITE); shade(img); d = features(img)
    ell(d, 190, 258, 46, 56, INK); ell(d, 322, 258, 46, 56, INK)
    ell(d, 190, 258, 15, 17, WHITE); ell(d, 322, 258, 15, 17, WHITE)
    ell(d, 256, 330, 22, 16, INK)
    arc(d, 256, 348, 28, 22, 20, 160, INK, 9)
    out["panda"] = img

    # хомяк
    img, d, f = head((238, 198, 148, 255))
    ell(d, 156, 158, 44, 44, f); ell(d, 356, 158, 44, 44, f)
    ell(d, 256, 296, 176, 166, f); shade(img); d = features(img)
    eyes_open(d, cy=254, gap=60, r=18)
    ell(d, 256, 322, 18, 14, (232, 140, 120, 255))
    ell(d, 176, 330, 54, 44, (250, 224, 190, 255)); ell(d, 336, 330, 54, 44, (250, 224, 190, 255))
    out["hamster"] = img

    # лягушка
    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 182, 178, 52, 52, GREEN); ell(d, 330, 178, 52, 52, GREEN)
    ell(d, 256, 320, 180, 146, GREEN); shade(img); d = features(img)
    ell(d, 182, 178, 30, 30, WHITE); ell(d, 330, 178, 30, 30, WHITE)
    ell(d, 186, 182, 13, 15, INK); ell(d, 326, 182, 13, 15, INK)
    arc(d, 256, 330, 92, 56, 20, 160, (36, 90, 40, 255), 14)
    out["frog"] = img

    # цыплёнок
    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 256, 288, 172, 164, (255, 222, 110, 255)); shade(img); d = features(img)
    eyes_open(d, cy=254, gap=60, r=20)
    poly(d, [(256, 344), (216, 308), (296, 308)], (240, 140, 60, 255))
    line(d, [(256, 128), (256, 92)], (240, 140, 60, 255), 12)
    ell(d, 256, 84, 16, 16, (240, 140, 60, 255))
    out["chick"] = img

    # лев
    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    for i in range(14):
        a = i / 14 * 2 * math.pi
        ell(d, 256 + 178 * math.cos(a), 280 + 178 * math.sin(a), 56, 56, (196, 132, 60, 255))
    ell(d, 256, 280, 172, 162, (244, 186, 96, 255)); shade(img); d = features(img)
    eyes_open(d, cy=256, gap=62, r=20)
    ell(d, 256, 336, 58, 46, (250, 222, 178, 255))
    ell(d, 256, 318, 22, 16, INK)
    arc(d, 256, 344, 28, 22, 20, 160, INK, 9)
    out["lion"] = img

    # заяц
    img, d, f = head((240, 240, 244, 255))
    ell(d, 178, 130, 38, 108, f); ell(d, 334, 130, 38, 108, f)
    ell(d, 178, 142, 20, 84, (246, 186, 196, 255)); ell(d, 334, 142, 20, 84, (246, 186, 196, 255))
    ell(d, 256, 306, 166, 156, f); shade(img); d = features(img)
    eyes_open(d, cy=286, gap=60, r=20)
    ell(d, 256, 336, 16, 12, (244, 143, 177, 255))
    out["bunny"] = img

    # пингвин
    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 256, 282, 174, 172, (52, 62, 76, 255)); shade(img); d = features(img)
    ell(d, 256, 312, 122, 132, WHITE)
    eyes_open(d, cy=238, gap=52, r=20)
    poly(d, [(256, 320), (224, 292), (288, 292)], (240, 150, 60, 255))
    out["penguin"] = img

    # обезьяна
    img, d, f = head((176, 128, 92, 255))
    ell(d, 118, 268, 40, 48, f); ell(d, 394, 268, 40, 48, f)
    ell(d, 256, 288, 168, 160, f); shade(img); d = features(img)
    ell(d, 256, 336, 108, 88, (238, 208, 176, 255))
    eyes_open(d, cy=246, gap=58, r=20)
    ell(d, 234, 322, 9, 13, (90, 66, 48, 255)); ell(d, 278, 322, 9, 13, (90, 66, 48, 255))
    arc(d, 256, 356, 40, 26, 20, 160, INK, 11)
    out["monkey"] = img

    return out


ANIMAL_EMOJI = {
    "cat": "🐱", "dog": "🐶", "fox": "🦊", "bear": "🐻", "panda": "🐼", "hamster": "🐹",
    "frog": "🐸", "chick": "🐥", "lion": "🦁", "bunny": "🐰", "penguin": "🐧", "monkey": "🐒",
}


# ---------------------------------------------------------------- набор «Реакции»

def reactions() -> tuple[dict[str, Image.Image], dict[str, Image.Image]]:
    """Возвращает (статика, анимации) — анимации пишутся в WebP."""
    static: dict[str, Image.Image] = {}
    animated: dict[str, Image.Image] = {}

    img = newc(); d = features(img)
    heart(d, 256, 262, 200, RED); shade(img)
    animated["heart"] = img

    img = newc(); d = features(img)
    star(d, 256, 262, 224, (255, 204, 60, 255)); shade(img)
    animated["star"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    poly(d, [(256, 46), (368, 190), (416, 330), (360, 442), (256, 480), (152, 442), (96, 330), (144, 190)],
         (232, 106, 46, 255))
    poly(d, [(256, 168), (320, 272), (344, 356), (306, 420), (256, 442), (206, 420), (168, 356), (192, 272)],
         (255, 196, 66, 255))
    shade(img)
    animated["fire"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    rrect(d, 150, 250, 300, 430, 44, (255, 214, 150, 255))
    rrect(d, 96, 176, 196, 330, 40, (255, 214, 150, 255))
    rrect(d, 150, 250, 300, 292, 16, (255, 236, 200, 255))
    shade(img); d = features(img)
    for i, (dy, w) in enumerate([(0, 30), (34, 22), (66, 26)]):
        arc(d, 232 + i * 44, 150 + dy, w, 46, 200, 340, (180, 190, 205, 220), 11)
    static["coffee"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    poly(d, [(256, 452), (110, 210), (402, 210)], (83, 74, 183, 255))
    rrect(d, 96, 196, 416, 236, 20, (150, 120, 220, 255))
    for i, col in enumerate([RED, BLUE, GREEN, PINK, (255, 204, 60, 255), (120, 200, 240, 255)]):
        a = math.radians(-160 + i * 26)
        ell(d, 256 + 210 * math.cos(a), 200 + 210 * math.sin(a), 14, 14, col)
    shade(img)
    animated["confetti"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    rrect(d, 170, 120, 342, 300, 40, (246, 120, 96, 255))
    rrect(d, 236, 120, 276, 430, 14, (255, 236, 200, 255))
    rrect(d, 170, 196, 342, 250, 14, (255, 236, 200, 255))
    ell(d, 226, 132, 34, 30, (246, 120, 96, 255)); ell(d, 286, 132, 34, 30, (246, 120, 96, 255))
    shade(img)
    static["gift"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 256, 220, 132, 160, (240, 90, 90, 255))
    line(d, [(256, 380), (256, 452)], (240, 90, 90, 255), 10)
    poly(d, [(256, 372), (216, 356), (256, 400), (296, 356)], (240, 90, 90, 255))
    shade(img)
    static["balloon"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    heart(d, 256, 262, 200, (214, 214, 220, 255)); shade(img); d = features(img)
    line(d, [(256, 130), (238, 220), (272, 268), (240, 330), (262, 410)], (120, 122, 130, 255), 14)
    static["broken-heart"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    for i in range(8):
        a = math.radians(i * 45)
        star(d, 256 + 142 * math.cos(a), 256 + 142 * math.sin(a), 32 if i % 2 else 50,
             (255, 214, 90, 255), rot=-90 + i * 20)
    star(d, 256, 256, 118, (255, 236, 160, 255))
    animated["sparkles"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    ell(d, 256, 268, 170, 170, (255, 224, 130, 255))
    ell(d, 330, 216, 150, 150, (0, 0, 0, 0))
    shade(img)
    static["moon"] = img

    img = newc(); d = ImageDraw.Draw(img, "RGBA")
    rrect(d, 92, 168, 420, 452, 46, (83, 74, 183, 255)); shade(img); d = features(img)
    rrect(d, 92, 220, 420, 272, 12, (150, 200, 245, 255))
    rrect(d, 226, 168, 286, 452, 10, (200, 224, 250, 255))
    ell(d, 212, 158, 46, 40, (150, 200, 245, 255)); ell(d, 300, 158, 46, 40, (150, 200, 245, 255))
    static["message"] = img

    img = text_sticker("+1", fill=(255, 236, 160, 255))
    static["plus-one"] = img

    img = text_sticker("СПС", fill=(190, 236, 200, 255))
    static["thanks"] = img

    return static, animated


REACT_EMOJI = {
    "heart": "❤️", "star": "⭐", "fire": "🔥", "confetti": "🎉", "coffee": "☕", "gift": "🎁",
    "balloon": "🎈", "broken-heart": "💔", "sparkles": "✨", "moon": "🌙", "message": "💬",
    "plus-one": "➕", "thanks": "🙏",
}


def main():
    made = []

    for name, img in smiles().items():
        made.append(save(img, f"smiles/{name}.png"))
    for name, img in animals().items():
        made.append(save(img, f"animals/{name}.png"))

    static, animated = reactions()
    for name, img in static.items():
        made.append(save(img, f"reactions/{name}.png"))
    makers = {"heart": pulse_frames, "star": spin_frames, "fire": flicker_frames,
              "confetti": bounce_frames, "sparkles": twinkle_frames}
    for name, img in animated.items():
        made.append(anim(img, makers[name](img), f"reactions/{name}.webp"))

    for path in made:
        kb = os.path.getsize(path) / 1024
        print(f"{kb:6.1f} КБ  {os.path.relpath(path, OUT)}")
    print(f"итого файлов: {len(made)}")


if __name__ == "__main__":
    main()
