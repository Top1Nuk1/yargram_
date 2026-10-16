# -*- coding: utf-8 -*-
"""Собрать встроенные наборы стикеров Yargram в картинки.

Раскладывает готовые файлы в `apps/web/public/stickers`:

    yargram/  — знаки приложения: лого, звезда, розетка, снежинка, метки, плашки
    smiles/   — простые лица: улыбки, злость, сон, очки и прочее

Запуск:

    python scripts/build-stickers.py

Почему рисуем SVG-строкой, а не кладём готовые картинки: знаки Yargram в
приложении — инлайн-SVG (`components/UserName.tsx`, `components/Logo.tsx`).
Пути оттуда скопированы сюда дословно, поэтому стикер и значок в интерфейсе
совпадают. Правишь знак в приложении — правишь строку здесь и пересобираешь.

🔥 Холст и прозрачность. Стикер кладут поверх пузыря и обоев, поэтому фон
обязан быть прозрачным, а не белым: белый квадрат видно на тёмной теме.
Статичные стикеры — 512×512 PNG, анимированные — 256×256 WebP: анимация из
двадцати кадров в 512 весила бы как десяток статичных.

🔥 `cairosvg` на Windows не работает (нет нативного Cairo), рендерим `resvg-py`.
Оба пакета стоят в общем venv:

    ~/.workbuddy-ai/binaries/python/envs/default
"""
from __future__ import annotations

import io
import math
import sys
from pathlib import Path

import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "apps" / "web" / "public" / "stickers"

CANVAS = 512
ANIMATED_CANVAS = 256
# Кадров в анимации и длительность одного кадра: двадцать по 50 мс — ровно
# секунда на цикл. Быстрее — рябит, медленнее — стикер кажется замершим.
ANIMATED_FRAMES = 20
FRAME_MS = 50

# Палитра светлой темы из apps/web/src/index.css.
BRAND = "#3390EC"
ACCENT = "#8964EB"
SUCCESS = "#3AA56C"
WARNING = "#E29A2D"
DANGER = "#DA4949"
TEAL = "#2BB3A3"
PINK = "#E8608F"
INK = "#18232D"
WHITE = "#FFFFFF"
GLYPH_SHADE = "#D9EFFA"

# Знаки приложения. Сетка у всех 48×48, поэтому на холст их вписывает
# `translate(центр) scale(10) translate(-24 -24)`: 48 × 10 = 480 из 512.
STAR_PATH = (
    "M30.85 7.46Q44.83 3.17 40.54 17.15Q53.46 24 40.54 30.85Q44.83 44.83 30.85 40.54"
    "Q24 53.46 17.15 40.54Q3.17 44.83 7.46 30.85Q-5.46 24 7.46 17.15Q3.17 3.17 17.15 7.46"
    "Q24 -5.46 30.85 7.46Z"
)
ROSETTE_PATH = (
    "M29.07 5.07Q37.53 0.56 37.86 10.14Q47.44 10.47 42.93 18.93Q51.07 24 42.93 29.07"
    "Q47.44 37.53 37.86 37.86Q37.53 47.44 29.07 42.93Q24 51.07 18.93 42.93Q10.47 47.44 10.14 37.86"
    "Q0.56 37.53 5.07 29.07Q-3.07 24 5.07 18.93Q0.56 10.47 10.14 10.14Q10.47 0.56 18.93 5.07"
    "Q24 -3.07 29.07 5.07Z"
)
GLYPH_PATH = (
    "M12.7 13.9c-.7-1.5 1.2-2.8 2.3-1.6L24 22l9-9.7c1.1-1.2 3-.1 2.4 1.5l-7.5 20.6"
    "a4.1 4.1 0 0 1-7.7 0l-7.5-20.5Z"
)
GLYPH_SHADE_PATH = "m18.2 18.5 5.8 6.3 5.8-6.3L24 32.7l-5.8-14.2Z"

FONT = "Arial, Helvetica, sans-serif"


def svg(body: str, size: int = CANVAS, transform: str = "") -> str:
    """Холст с прозрачным фоном. `transform` двигает всё содержимое сразу."""
    inner = f'<g transform="{transform}">{body}</g>' if transform else body
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">{inner}</svg>'
    )


def inner_of(full_svg: str) -> str:
    """Вытащить содержимое из готового SVG — нужно, чтобы завернуть кадр анимации.

    Строка собирается нами же в `svg()`, поэтому вид у неё ровно один:
    открывающий тег, содержимое, закрывающий тег.
    """
    return full_svg.split(">", 1)[1].rsplit("</svg>", 1)[0]


def with_headroom(full_svg: str, size: int = CANVAS) -> str:
    """Ужать содержимое, оставив запас под анимацию.

    🔥 Статичный стикер вписан в холст почти до края — так он крупный и заметный.
    Но анимация его двигает: на пике пульсации или в corners поворота картинка
    вылезает за край и **обрезается**. Поэтому для анимированных заранее
    оставляем поле, а саму анимацию рисуем внутри него.
    """
    k = size / CANVAS
    inner = inner_of(full_svg)
    # Внутренняя группа уже масштабирует содержимое под холст `size` — второй
    # раз масштабировать нельзя, иначе рисунок уедет и обрежется. Запас под
    # анимацию даём внешней группой, вокруг всего.
    return svg(
        f'<g transform="translate({size / 2} {size / 2}) scale({0.74}) translate({-size / 2} {-size / 2})">'
        f"{inner}</g>",
        size,
    )


def centered(size: int = CANVAS) -> str:
    """Вписать сетку 48×48 в холст: знаки нарисованы вокруг центра (24, 24)."""
    scale = (size - 32) / 48
    return f"translate({size / 2} {size / 2}) scale({scale}) translate(-24 -24)"


def mark(path: str, color: str, inner: str = "", size: int = CANVAS) -> str:
    return svg(f'<path d="{path}" fill="{color}"/>{inner}', size, centered(size))


def logo(color: str = BRAND, size: int = CANVAS) -> str:
    """Круг со стрелкой — знак приложения один в один (`components/Logo.tsx`)."""
    inner = (
        f'<circle cx="24" cy="24" r="22" fill="{color}"/>'
        f'<path d="{GLYPH_PATH}" fill="{WHITE}"/>'
        f'<path d="{GLYPH_SHADE_PATH}" fill="{GLYPH_SHADE}"/>'
    )
    return svg(inner, size, centered(size))


def star(color: str = BRAND, size: int = CANVAS) -> str:
    inner = (
        f'<g transform="translate(24 24) scale(1.02) translate(-24 -24)">'
        f'<path d="{GLYPH_PATH}" fill="{WHITE}"/>'
        f'<path d="{GLYPH_SHADE_PATH}" fill="{GLYPH_SHADE}"/></g>'
    )
    return mark(STAR_PATH, color, inner, size)


def rosette(color: str = BRAND, size: int = CANVAS) -> str:
    inner = (
        '<path d="M16.4 24.7 21.3 29.7 32 18.6" fill="none" stroke="#FFFFFF" '
        'stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'
    )
    return mark(ROSETTE_PATH, color, inner, size)


def snowflake(color: str = BRAND, size: int = CANVAS) -> str:
    """Снежинка Lucide живёт в сетке 24×24 и выходит за её края.

    🔥 Ставим 15, а не 16: при 16 луч касается самого края холста, и
    `audit-stickers.py` справедливо ругается на обрезку. Плюс это анимируется,
    а анимации нужно поле по краям.
    """
    body = (
        '<g stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">'
        '<path d="m2 12 20 0"/><path d="M12 2v20"/>'
        '<path d="m4.93 4.93 14.14 14.14"/><path d="m19.07 4.93-14.14 14.14"/>'
        '<path d="M12 2l-2 3h4l-2-3Z" fill="{c}" stroke="none"/>'
        "</g>"
    ).format(c=color)
    return svg(body, size, f"translate({size / 2} {size / 2}) scale({size / 24 * 0.92}) translate(-12 -12)")


def heart(color: str = DANGER, size: int = CANVAS) -> str:
    # 🔥 Путь задан на холсте 512, поэтому на меньшем холсте его нужно
    # масштабировать. Без этого `heart(..., 256)` для анимации рисует сердце
    # в полтора раза крупнее холста, и оно обрезается по краям.
    k = size / CANVAS
    body = (
        "M256 448C256 448 64 320 64 192 64 128 112 80 176 80 216 80 244 104 256 136"
        " 268 104 296 80 336 80 400 80 448 128 448 192 448 320 256 448 256 448Z"
    )
    return svg(
        f'<g transform="scale({k})"><path d="{body}" fill="{color}"/></g>',
        size,
    )


def frame(label: str, color: str, size: int = CANVAS) -> str:
    """Метка рамкой — ровно как SCAM/FAKE/BOT рядом с ником."""
    k = size / CANVAS
    width = 434 * k
    height = 158 * k
    x = (size - width) / 2
    y = (size - height) / 2
    return svg(
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'rx="{45 * k:.1f}" fill="none" stroke="{color}" stroke-width="{14 * k:.1f}"/>'
        f'<text x="{size / 2}" y="{size / 2 + 2 * k}" text-anchor="middle" '
        f'dominant-baseline="central" font-family="{FONT}" font-size="{116 * k:.1f}" '
        f'font-weight="900" fill="{color}" textLength="{350 * k:.1f}" '
        f'lengthAdjust="spacingAndGlyphs">{label}</text>',
        size,
    )


def plate(inner: str, color: str, size: int = CANVAS) -> str:
    """Знак на мягкой плашке — как иконка приложения."""
    k = size / CANVAS
    return svg(
        f'<rect x="{24 * k:.1f}" y="{24 * k:.1f}" width="{(CANVAS - 48) * k:.1f}" '
        f'height="{(CANVAS - 48) * k:.1f}" rx="{120 * k:.1f}" fill="{color}"/>'
        f'<g transform="translate({size / 2} {size / 2}) scale({0.72 * k}) translate(-256 -256)">'
        f"{inner}</g>",
        size,
    )


# --------------------------------------------------------------------------
# Лица. Одна основа, разные глаза и рот — так набор выглядит собранным, а не
# как двадцать чужих картинок.
# --------------------------------------------------------------------------

EYE_L = (178, 214)
EYE_R = (334, 214)
MOUTH = (256, 336)


def _eye_pair(left: str, right: str) -> str:
    return left + right


def eyes(style: str, color: str = INK) -> str:
    lx, ly = EYE_L
    rx, ry = EYE_R

    def stroke(width: int = 26) -> str:
        return (
            f'fill="none" stroke="{color}" stroke-width="{width}" '
            'stroke-linecap="round" stroke-linejoin="round"'
        )

    if style == "open":
        return _eye_pair(
            f'<circle cx="{lx}" cy="{ly}" r="27" fill="{color}"/>',
            f'<circle cx="{rx}" cy="{ry}" r="27" fill="{color}"/>',
        )
    if style == "happy":
        return _eye_pair(
            f'<path d="M{lx - 34} {ly + 8} Q{lx} {ly - 26} {lx + 34} {ly + 8}" {stroke()}/>',
            f'<path d="M{rx - 34} {ry + 8} Q{rx} {ry - 26} {rx + 34} {ry + 8}" {stroke()}/>',
        )
    if style == "wink":
        return _eye_pair(
            f'<path d="M{lx - 34} {ly + 8} Q{lx} {ly - 26} {lx + 34} {ly + 8}" {stroke()}/>',
            f'<circle cx="{rx}" cy="{ry}" r="27" fill="{color}"/>',
        )
    if style == "closed":
        return _eye_pair(
            f'<path d="M{lx - 32} {ly} L{lx + 32} {ly}" {stroke()}/>',
            f'<path d="M{rx - 32} {ry} L{rx + 32} {ry}" {stroke()}/>',
        )
    if style == "sad":
        return _eye_pair(
            f'<circle cx="{lx}" cy="{ly + 6}" r="25" fill="{color}"/>'
            f'<path d="M{lx - 36} {ly - 34} L{lx + 30} {ly - 16}" {stroke(20)}/>',
            f'<circle cx="{rx}" cy="{ry + 6}" r="25" fill="{color}"/>'
            f'<path d="M{rx + 36} {ry - 34} L{rx - 30} {ry - 16}" {stroke(20)}/>',
        )
    if style == "angry":
        return _eye_pair(
            f'<circle cx="{lx}" cy="{ly + 10}" r="24" fill="{color}"/>'
            f'<path d="M{lx - 40} {ly - 22} L{lx + 30} {ly + 2}" {stroke(22)}/>',
            f'<circle cx="{rx}" cy="{ry + 10}" r="24" fill="{color}"/>'
            f'<path d="M{rx + 40} {ry - 22} L{rx - 30} {ry + 2}" {stroke(22)}/>',
        )
    if style == "surprised":
        return _eye_pair(
            f'<circle cx="{lx}" cy="{ly}" r="34" fill="{WHITE}"/>'
            f'<circle cx="{lx}" cy="{ly}" r="34" fill="none" stroke="{color}" stroke-width="12"/>'
            f'<circle cx="{lx}" cy="{ly}" r="15" fill="{color}"/>',
            f'<circle cx="{rx}" cy="{ry}" r="34" fill="{WHITE}"/>'
            f'<circle cx="{rx}" cy="{ry}" r="34" fill="none" stroke="{color}" stroke-width="12"/>'
            f'<circle cx="{rx}" cy="{ry}" r="15" fill="{color}"/>',
        )
    if style == "hearts":
        # Сердце-глаз: две дуги и остриё — проще выразить одной фигурой.
        def heart_at(cx: float, cy: float, r: float) -> str:
            return (
                f'<path d="M{cx} {cy + r} C{cx - r * 1.7} {cy - r * 0.2} {cx - r * 1.1} {cy - r * 1.4} '
                f'{cx} {cy - r * 0.5} C{cx + r * 1.1} {cy - r * 1.4} {cx + r * 1.7} {cy - r * 0.2} '
                f'{cx} {cy + r} Z" fill="{PINK}"/>'
            )

        return _eye_pair(heart_at(lx, ly, 34), heart_at(rx, ry, 34))
    if style == "stars":
        def star_at(cx: float, cy: float, r: float) -> str:
            import math

            points = []
            for index in range(10):
                radius = r if index % 2 == 0 else r * 0.45
                angle = -math.pi / 2 + index * math.pi / 5
                points.append(
                    f"{cx + radius * math.cos(angle):.1f},{cy + radius * math.sin(angle):.1f}"
                )
            return f'<polygon points="{" ".join(points)}" fill="{WARNING}"/>'

        return _eye_pair(star_at(lx, ly, 36), star_at(rx, ry, 36))
    if style == "cross":
        return _eye_pair(
            f'<path d="M{lx - 26} {ly - 26} L{lx + 26} {ly + 26} M{lx + 26} {ly - 26} L{lx - 26} {ly + 26}" {stroke(22)}/>',
            f'<path d="M{rx - 26} {ry - 26} L{rx + 26} {ry + 26} M{rx + 26} {ry - 26} L{rx - 26} {ry + 26}" {stroke(22)}/>',
        )
    if style == "spiral":
        return _eye_pair(
            f'<path d="M{lx} {ly - 30} A30 30 0 1 1 {lx - 6} {ly + 30} A20 20 0 1 0 {lx + 8} {ly - 18} A10 10 0 1 1 {lx - 2} {ly + 6}" {stroke(12)}/>',
            f'<path d="M{rx} {ry - 30} A30 30 0 1 1 {rx - 6} {ry + 30} A20 20 0 1 0 {rx + 8} {ry - 18} A10 10 0 1 1 {rx - 2} {ry + 6}" {stroke(12)}/>',
        )
    if style == "shades":
        return (
            f'<path d="M96 190h320a18 18 0 0 1 18 18v18c0 34-26 62-60 62h-26c-30 0-52-20-60-46'
            f'c-8 26-30 46-60 46h-26c-34 0-60-28-60-62v-18a18 18 0 0 1 18-18Z" fill="{INK}"/>'
            f'<path d="M96 196 L{lx - 40} 196" stroke="{INK}" stroke-width="16" fill="none"/>'
        )
    raise ValueError(f"неизвестный стиль глаз: {style}")


def mouth(style: str, color: str = INK) -> str:
    mx, my = MOUTH

    def stroke(width: int = 26) -> str:
        return (
            f'fill="none" stroke="{color}" stroke-width="{width}" '
            'stroke-linecap="round" stroke-linejoin="round"'
        )

    if style == "smile":
        return f'<path d="M{mx - 74} {my - 12} Q{mx} {my + 62} {mx + 74} {my - 12}" {stroke()}/>'
    if style == "grin":
        return f'<path d="M{mx - 84} {my - 16} A84 84 0 0 0 {mx + 84} {my - 16} Z" fill="{color}"/>'
    if style == "laugh":
        return (
            f'<path d="M{mx - 92} {my - 20} A92 92 0 0 0 {mx + 92} {my - 20} Z" fill="{color}"/>'
            f'<path d="M{mx - 44} {my + 42} A44 34 0 0 0 {mx + 44} {my + 42} Z" fill="{PINK}"/>'
        )
    if style == "open":
        return f'<ellipse cx="{mx}" cy="{my + 6}" rx="52" ry="64" fill="{color}"/>'
    if style == "sad":
        return f'<path d="M{mx - 72} {my + 34} Q{mx} {my - 40} {mx + 72} {my + 34}" {stroke()}/>'
    if style == "flat":
        return f'<path d="M{mx - 60} {my + 10} L{mx + 60} {my + 10}" {stroke()}/>'
    if style == "wavy":
        return f'<path d="M{mx - 70} {my + 8} q35 -34 70 0 q35 34 70 0" {stroke()}/>'
    if style == "tongue":
        return (
            f'<path d="M{mx - 74} {my - 12} Q{mx} {my + 56} {mx + 74} {my - 12}" {stroke()}/>'
            f'<path d="M{mx - 34} {my + 34} q34 62 68 0 Z" fill="{PINK}"/>'
        )
    if style == "kiss":
        return (
            f'<ellipse cx="{mx}" cy="{my}" rx="34" ry="26" fill="{color}"/>'
            f'<path d="M{mx + 34} {my - 26} q30 8 34 30" {stroke(16)}/>'
        )
    if style == "smirk":
        return f'<path d="M{mx - 74} {my + 20} Q{mx + 10} {my + 40} {mx + 78} {my - 26}" {stroke()}/>'
    raise ValueError(f"неизвестный стиль рта: {style}")


def face(
    color: str,
    eye_style: str = "open",
    mouth_style: str = "smile",
    extra: str = "",
    shape: str = "circle",
    size: int = CANVAS,
) -> str:
    """Лицо на цветном круге. `extra` рисуется поверх и до лица."""
    k = size / CANVAS
    if shape == "circle":
        scale = f"translate({size / 2} {size / 2}) scale({k}) translate(-256 -256)"
        base = f'<circle cx="256" cy="256" r="228" fill="{color}"/>'
        return svg(base + extra + eyes(eye_style) + mouth(mouth_style), size, scale)
    if shape == "ghost":
        # Привидение рисуется по сетке 512.
        #
        # 🔥 Путь с зубцами снизу, выписанный руками, **несимметричен**: сколько
        # раз повторишь зубец слева, столько же нужно повторить справа, иначе
        # привидение уезжает влево (проверка ловит это: поля выходят 60 и 91).
        # Поэтому зубцы here считаются программно: четыре одинаковых сегмента
        # по 98 px на ширину 392. Симметрия получается по построению, а не
        # подгонкой, и следующая правка зубцов её не сломает.
        half = 196          # полуширина корпуса: 60…452
        arc_y = 256         # центр верхней дуги
        teeth_y = 396       # где начинаются зубцы
        depth = 76          # управляющая точка дуги; высота зубца вдвое меньше
        tooth = half * 2 // 4  # 98: сегмент «зубец + промежуток»
        path = (
            f"M{256 - half} {arc_y}"
            f"A{half} {half} 0 0 1 {256 + half} {arc_y}"
            f"L{256 + half} {teeth_y}"
        )
        for _ in range(4):
            path += f"q{-tooth // 2} {depth} {-tooth} 0"
        path += f"L{256 - half} {arc_y}Z"
        base = f'<path d="{path}" fill="{color}"/>'
        scale = f"translate({size / 2} {size / 2}) scale({k}) translate(-256 -256)"
        return svg(base + eyes(eye_style) + mouth(mouth_style), size, scale)
    if shape == "robot":
        # У робота антенна торчит вверх, поэтому корпус сдвинут вниз: иначе
        # антенна упиралась бы в край холста, а низ оставался пустым.
        top = 64
        bottom = 480
        shift = (CANVAS - (bottom - top)) / 2 - top
        base = (
            f'<rect x="46" y="120" width="420" height="360" rx="96" fill="{color}"/>'
            f'<rect x="236" y="64" width="40" height="60" fill="{color}"/>'
            f'<circle cx="256" cy="64" r="26" fill="{WARNING}"/>'
            f'<rect x="106" y="224" width="300" height="128" rx="52" fill="{INK}"/>'
        )
        scale = (
            f"translate({size / 2} {size / 2 + shift * k}) scale({k}) translate(-256 -256)"
        )
        return svg(base + extra + eyes(eye_style) + mouth(mouth_style), size, scale)
    raise ValueError(f"неизвестная форма: {shape}")


def _tear(cx: float, cy: float, size: float = 34) -> str:
    return (
        f'<path d="M{cx} {cy - size} q{size * 0.8} {size * 1.2} {size * 0.8} {size * 1.9} '
        f'a{size * 0.8} {size * 0.8} 0 0 1 {-size * 1.6} 0 q0 {-size * 0.7} {size * 0.8} {-size * 1.9}Z" '
        f'fill="#5FC8F5"/>'
    )


def _blush() -> str:
    return (
        f'<ellipse cx="118" cy="292" rx="42" ry="26" fill="{PINK}" opacity="0.55"/>'
        f'<ellipse cx="394" cy="292" rx="42" ry="26" fill="{PINK}" opacity="0.55"/>'
    )


def _zzz() -> str:
    return (
        f'<text x="392" y="140" font-family="{FONT}" font-size="72" font-weight="900" '
        f'fill="{INK}">Z</text>'
        f'<text x="436" y="86" font-family="{FONT}" font-size="52" font-weight="900" '
        f'fill="{INK}">Z</text>'
        f'<text x="468" y="44" font-family="{FONT}" font-size="36" font-weight="900" '
        f'fill="{INK}">Z</text>'
    )


def _sweat() -> str:
    return (
        f'<path d="M420 118 q26 38 26 60 a26 26 0 0 1 -52 0 q0 -22 26 -60Z" fill="#5FC8F5"/>'
    )


def _confetti() -> str:
    return (
        f'<circle cx="70" cy="96" r="18" fill="{WARNING}"/>'
        f'<circle cx="452" cy="150" r="14" fill="{ACCENT}"/>'
        f'<circle cx="96" cy="424" r="16" fill="{SUCCESS}"/>'
        f'<circle cx="440" cy="412" r="20" fill="{PINK}"/>'
        f'<rect x="34" y="240" width="30" height="30" rx="8" fill="{TEAL}" transform="rotate(24 49 255)"/>'
        f'<rect x="446" y="268" width="30" height="30" rx="8" fill="{BRAND}" transform="rotate(-18 461 283)"/>'
    )


# --------------------------------------------------------------------------
# Наборы
# --------------------------------------------------------------------------

YARGRAM_PACK = [
    ("logo", lambda: logo(BRAND)),
    ("logo-accent", lambda: logo(ACCENT)),
    ("logo-success", lambda: logo(SUCCESS)),
    ("logo-warning", lambda: logo(WARNING)),
    ("logo-danger", lambda: logo(DANGER)),
    ("star", lambda: star(BRAND)),
    ("star-accent", lambda: star(ACCENT)),
    ("rosette", lambda: rosette(BRAND)),
    ("snowflake", lambda: snowflake(BRAND)),
    ("heart", lambda: heart(DANGER)),
    ("heart-brand", lambda: heart(BRAND)),
    ("plate", lambda: plate(logo(BRAND), BRAND)),
    ("star-plate", lambda: plate(star(WHITE), ACCENT)),
    ("scam", lambda: frame("SCAM", DANGER)),
    ("fake", lambda: frame("FAKE", WARNING)),
    ("bot", lambda: frame("BOT", BRAND)),
]

# Анимация: кадр — та же картинка с другой геометрией. Эффект задаётся именем,
# фаза кадра приходит в `save_animated`.
YARGRAM_ANIMATED = [
    ("logo-pulse", lambda: logo(BRAND, ANIMATED_CANVAS), "pulse"),
    ("star-spin", lambda: star(ACCENT, ANIMATED_CANVAS), "spin"),
    ("heart-beat", lambda: heart(DANGER, ANIMATED_CANVAS), "beat"),
    ("snowflake-spin", lambda: snowflake(BRAND, ANIMATED_CANVAS), "spin"),
]

SMILES_PACK = [
    ("smile", BRAND, "open", "smile", ""),
    ("laugh", BRAND, "happy", "laugh", ""),
    ("wink", ACCENT, "wink", "smirk", ""),
    ("sad", ACCENT, "sad", "sad", ""),
    ("cry", BRAND, "closed", "sad", _tear(178, 258) + _tear(334, 258)),
    ("angry", DANGER, "angry", "sad", ""),
    ("surprised", WARNING, "surprised", "open", ""),
    ("kiss", PINK, "happy", "kiss", ""),
    ("think", TEAL, "open", "flat", _sweat()),
    ("sleep", ACCENT, "closed", "open", _zzz()),
    ("cool", INK, "shades", "smirk", ""),
    ("joy", WARNING, "happy", "laugh", _tear(120, 250) + _tear(392, 250)),
    ("shy", PINK, "happy", "smile", _blush()),
    ("tongue", SUCCESS, "wink", "tongue", ""),
    ("neutral", TEAL, "open", "flat", ""),
    ("scared", ACCENT, "surprised", "open", _sweat()),
    ("sick", SUCCESS, "cross", "wavy", _sweat()),
    ("robot", BRAND, "open", "flat", "", "robot"),
    ("ghost", ACCENT, "closed", "open", "", "ghost"),
    ("in-love", PINK, "hearts", "smile", ""),
    ("star-eyes", WARNING, "stars", "grin", ""),
    ("dizzy", TEAL, "spiral", "wavy", ""),
    ("party", ACCENT, "happy", "laugh", _confetti()),
    ("smirk", SUCCESS, "open", "smirk", ""),
]


def render(image_svg: str, size: int) -> Image.Image:
    data = resvg_py.svg_to_bytes(svg_string=image_svg, width=size, height=size)
    return Image.open(io.BytesIO(bytes(data))).convert("RGBA")


def animated_svg(inner_svg: str, effect: str, progress: float, size: int) -> str:
    """Кадр анимации: та же картинка, но повёрнутая или сжатая по фазе цикла."""
    half = size / 2
    if effect == "pulse":
        k = 1 + 0.09 * math.sin(progress * 2 * math.pi)
    elif effect == "beat":
        # Два удара за цикл — как у настоящего сердца: сильный и слабый.
        phase = progress * 2 * math.pi
        k = 1 + 0.12 * math.sin(phase * 2) ** 2 + 0.05 * math.sin(phase * 4) ** 2
    elif effect == "spin":
        k = 1.0
    else:
        raise ValueError(f"неизвестная анимация: {effect}")
    rotate = progress * 360 if effect == "spin" else 0
    transform = (
        f"translate({half} {half}) rotate({rotate:.2f}) scale({k:.4f}) translate({-half} {-half})"
    )
    return svg(f'<g transform="{transform}">{inner_svg}</g>', size)


def save_png(image_svg: str, path: Path, size: int) -> None:
    image = render(image_svg, size)
    low, high = image.getchannel("A").getextrema()
    if low != 0:
        raise SystemExit(f"{path.name}: нет прозрачных пикселей — фон залит")
    image.save(path, "PNG", optimize=True)
    print(f"  {path.name}  {size}x{size}  {path.stat().st_size // 1024} КБ")


def save_animated(image_svg: str, effect: str, path: Path, size: int) -> None:
    inner = inner_of(image_svg)
    frames = [
        render(animated_svg(inner, effect, index / ANIMATED_FRAMES, size), size)
        for index in range(ANIMATED_FRAMES)
    ]
    frames[0].save(
        path,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        lossless=True,
        quality=100,
        method=4,
    )
    with Image.open(path) as check:
        if check.format != "WEBP" or not getattr(check, "is_animated", False):
            raise SystemExit(f"{path.name}: не анимированный WebP")
    print(f"  {path.name}  {size}x{size}  {ANIMATED_FRAMES} кадров  {path.stat().st_size // 1024} КБ")


def build() -> None:
    yargram_dir = OUT_ROOT / "yargram"
    smiles_dir = OUT_ROOT / "smiles"
    for directory in (yargram_dir, smiles_dir):
        directory.mkdir(parents=True, exist_ok=True)

    print("Набор «Yargram»")
    for name, builder in YARGRAM_PACK:
        save_png(builder(), yargram_dir / f"{name}.png", CANVAS)
    for name, builder, effect in YARGRAM_ANIMATED:
        # Запас под анимацию обязателен: без него на пике пульсации стикер
        # вылезает за край холста и обрезается — видно как срезанный угол.
        # Размер передаём обязательно: `with_headroom` без него посчитает
        # поле по холсту 512 и завернёт содержимое, уже вписанное в 256.
        save_animated(
            with_headroom(builder(), ANIMATED_CANVAS),
            effect,
            yargram_dir / f"{name}.webp",
            ANIMATED_CANVAS,
        )

    print("Набор «Смайлы»")
    for entry in SMILES_PACK:
        name, color, eye_style, mouth_style = entry[0], entry[1], entry[2], entry[3]
        extra = entry[4] if len(entry) > 4 else ""
        shape = entry[5] if len(entry) > 5 else "circle"
        save_png(
            face(color, eye_style, mouth_style, extra, shape),
            smiles_dir / f"{name}.png",
            CANVAS,
        )


if __name__ == "__main__":
    try:
        build()
    except KeyboardInterrupt:
        sys.exit(130)
