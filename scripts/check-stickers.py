# -*- coding: utf-8 -*-
"""Собрать контрольный лист стикеров: все картинки на одной полосе.

Глазами. `resvg` молчит, а ошибка видна только глазами: съехавший знак или
растянутая надпись в PNG не дают ни ошибки, ни предупреждения.

    python scripts/check-stickers.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STICKERS = ROOT / "apps" / "web" / "public" / "stickers"
TILE = 150
COLUMNS = 8
# Подложка светлая и слегка «грязная»: на идеально белой прозрачный фон
# выглядит вылизанным, и промах с центрировкой не бросается в глаза.
BACKDROP = (235, 241, 248, 255)


def collect() -> list[tuple[str, Path]]:
    entries = [
        (f"{group.name}/{path.name}", path)
        for group in sorted(STICKERS.iterdir())
        if group.is_dir()
        for path in sorted(group.iterdir())
        if path.suffix in {".png", ".webp"}
    ]
    return entries


def sheet_for(name: str, entries: list[tuple[str, Path]]) -> Path:
    rows = (len(entries) + COLUMNS - 1) // COLUMNS
    sheet = Image.new("RGBA", (COLUMNS * TILE, rows * TILE), BACKDROP)
    for index, (_, path) in enumerate(entries):
        with Image.open(path) as source:
            frame = source.convert("RGBA")
            # Анимированный WebP отдаёт первый кадр — для проверки он и нужен.
            frame.thumbnail((TILE - 12, TILE - 12), Image.LANCZOS)
        x = (index % COLUMNS) * TILE + (TILE - frame.width) // 2
        y = (index // COLUMNS) * TILE + (TILE - frame.height) // 2
        sheet.paste(frame, (x, y), frame)
    out = Path(tempfile.gettempdir()) / f"{name}.png"
    sheet.convert("RGB").save(out)
    return out


def main() -> int:
    entries = collect()
    if not entries:
        print("стикеров нет — сначала запусти scripts/build-stickers.py", file=sys.stderr)
        return 1
    for group in sorted({entry[0].split("/")[0] for entry in entries}):
        subset = [entry for entry in entries if entry[0].startswith(f"{group}/")]
        print(f"{group}: {len(subset)} шт. -> {sheet_for(f'stickers-{group}', subset)}")
    print(f"всего: {len(entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())