# -*- coding: utf-8 -*-
"""Проверить геометрию стикеров: прозрачность, заполнение, центрировка.

`resvg` не предупреждает ни о съехавшем знаке, ни о растянутой надписи — PNG
получится «неправильным» молча. Поэтому проверяем то, что можно измерить:

* есть ли полностью прозрачные пиксели (фон не залит);
* сколько холста занимает рисунок (слишком пусто — знак уехал или вписан мелко);
* симметричны ли поля слева и справа, сверху и снизу (центрировка);
* для анимаций — что кадров больше одного и они действительно различаются.

    python scripts/audit-stickers.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
STICKERS = ROOT / "apps" / "web" / "public" / "stickers"

# Рисунок должен занимать хотя бы столько-то холста. Знак 48×48 на холсте
# 512 вписан с полями по 16 px, и это ~94 % — ниже 40 % точно ошибка масштаба.
# Считаем по **наибольшей** стороне, а не по площади: метка BOT — это широкая
# рамка 434×158, и её площадь 26 % холста, хотя по размеру она вписана верно.
MIN_SPAN = 0.55
# Разница полей с разных сторон в долях холста. Снежинка Lucide и метка рамкой
# центрируются точно, а вот звезда с лучами почти в край — небольшой перекос
# допустим, большой означает, что путь вписан со сдвигом.
MAX_SKEW = 0.06
# Пиксель у самого края означает, что содержимое обрезано холстом. Так портится
# анимация: на пике пульсации или поворота картинка вылезает за край и режется.
BORDER = 1


def border_touched(image: Image.Image) -> bool:
    """Есть ли непрозрачный пиксель у самого края холста."""
    alpha = image.getchannel("A")
    width, height = alpha.size
    edges = [
        alpha.crop((0, 0, width, BORDER)),
        alpha.crop((0, height - BORDER, width, height)),
        alpha.crop((0, 0, BORDER, height)),
        alpha.crop((width - BORDER, 0, width, height)),
    ]
    return any(edge.getextrema()[1] >= 8 for edge in edges)


def alpha_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Прямоугольник с непрозрачными пикселями: (left, top, right, bottom)."""
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return None
    # `getbbox` считает любой ненулевой альфа, поэтому помечаем совсем прозрачное.
    return box if alpha.getextrema()[1] >= 8 else None


def check(path: Path, problems: list[str]) -> None:
    with Image.open(path) as source:
        count = getattr(source, "n_frames", 1)
        if count < 2 and path.suffix == ".webp":
            problems.append(f"{path.name}: WebP без анимации ({count} кадр)")
            return
        # 🔥 У анимации геометрию смотрим **по всем кадрам**, а не по первому.
        # Вращение и пульсация специально уводят рисунок от центра, и такой
        # сдвиг — замысел, а не ошибка. Ошибка выглядит иначе: содержимое
        # упирается в край холста, то есть обрезается.
        shots: list[Image.Image] = []
        for index in range(count):
            source.seek(index)
            shots.append(source.convert("RGBA"))
        if count > 1 and ImageChops.difference(shots[0], shots[-1]).getbbox() is None:
            problems.append(f"{path.name}: кадры одинаковые — анимации нет")

        boxes = [alpha_box(shot) for shot in shots]
        if any(box is None for box in boxes):
            problems.append(f"{path.name}: холст пустой")
            return
        if any(shot.getchannel("A").getextrema()[0] != 0 for shot in shots):
            problems.append(f"{path.name}: нет прозрачных пикселей — фон залит")
        if any(border_touched(shot) for shot in shots):
            problems.append(f"{path.name}: содержимое упирается в край холста")

        width, height = shots[0].size
        lefts, tops, rights, bottoms = zip(*boxes)
        # По наибольшей стороне: у метки BOT ширина 434 из 512, а площадь
        # в четыре раза меньше прямоугольника холста — и она при этом вписана
        # верно. Проверять площадь значило бы ругаться на нормальные картинки.
        span = max(
            max((right - left) / width for left, right in zip(lefts, rights)),
            max((bottom - top) / height for top, bottom in zip(tops, bottoms)),
        )
        if span < MIN_SPAN:
            problems.append(f"{path.name}: рисунок занимает лишь {span:.0%} холста")
        # Перекос — по объединённому контуру: у анимации в каждом кадре он свой,
        # и сравнивать надо их между собой, а не с первым кадром.
        skew_x = abs((min(lefts) - (width - max(rights)))) / width
        skew_y = abs((min(tops) - (height - max(bottoms)))) / height
        if skew_x > MAX_SKEW:
            problems.append(
                f"{path.name}: уехал по горизонтали (поля {min(lefts)} и {width - max(rights)})"
            )
        if skew_y > MAX_SKEW:
            problems.append(
                f"{path.name}: уехал по вертикали (поля {min(tops)} и {height - max(bottoms)})"
            )


def main() -> int:
    paths = sorted(
        path
        for path in STICKERS.rglob("*")
        if path.suffix in {".png", ".webp"}
    )
    if not paths:
        print("стикеров нет — сначала запусти scripts/build-stickers.py", file=sys.stderr)
        return 1
    problems: list[str] = []
    for path in paths:
        check(path, problems)
    print(f"проверено {len(paths)} шт.")
    for problem in problems:
        print(f"  ✗ {problem}")
    if problems:
        print(f"проблем: {len(problems)}")
        return 1
    print("все стикеры на месте: прозрачные, по центру, анимации живые")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())