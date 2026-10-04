#!/usr/bin/env python3
"""Создаёт 192x192 PNG-иконку PWA из 512x512 источника (чистый stdlib, без PIL).

Используется один раз при добавлении PWA-установки в apps/web. На выходе:
  apps/web/public/brand/icon-192.png  (сжатая копия)
  apps/web/public/brand/icon-512.png  (копия источника)
"""
import struct
import zlib
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "apps", "landing", "public", "brand", "yargram.png")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "brand")
OUT_192 = os.path.join(OUT_DIR, "icon-192.png")
OUT_512 = os.path.join(OUT_DIR, "icon-512.png")
TARGET = 192


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    w = h = bitd = ctype = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype_raw = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype_raw == b"IHDR":
            w, h, bitd, ctype = struct.unpack(">IIBB", chunk[:10])
        elif ctype_raw == b"IDAT":
            idat += chunk
        elif ctype_raw == b"IEND":
            break
        pos += 12 + length
    assert ctype == 6, f"ожидается RGBA (colortype 6), получен {ctype}"
    assert bitd == 8, f"ожидается 8 бит, получено {bitd}"
    raw = zlib.decompress(idat)
    stride = w * 4
    # Дефильтрация (фильтры PNG 0..4)
    out = bytearray()
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if ftype == 1:  # Sub
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + a) & 0xFF
        elif ftype == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:  # Average
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                b = prev[i]
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
        elif ftype == 4:  # Paeth
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                b = prev[i]
                c = prev[i - 4] if i >= 4 else 0
                pp = a + b - c
                pa = abs(pp - a); pb = abs(pp - b); pc = abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out += line
        prev = line
    return w, h, out


def downsample(w, h, pix, tw, th):
    # Боксовое усреднение. Источник и цель квадратные (512 -> 192); шаг дробный.
    sx = w / tw
    sy = h / th
    res = bytearray()
    for dy in range(th):
        y0 = int(dy * sy)
        y1 = max(int((dy + 1) * sy), y0 + 1)
        for dx in range(tw):
            x0 = int(dx * sx)
            x1 = max(int((dx + 1) * sx), x0 + 1)
            r = g = b = a = n = 0
            for yy in range(y0, y1):
                base = yy * w * 4
                for xx in range(x0, x1):
                    o = base + xx * 4
                    r += pix[o]; g += pix[o + 1]; b += pix[o + 2]; a += pix[o + 3]
                    n += 1
            inv = 1.0 / n
            res += bytes((int(round(r * inv)), int(round(g * inv)),
                          int(round(b * inv)), int(round(a * inv))))
    return res


def write_png(path, w, h, pix):
    def chunk(tag, body):
        c = tag + body
        return struct.pack(">I", len(body)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)  # filter None
        raw += pix[y * stride:(y + 1) * stride]
    idat = zlib.compress(bytes(raw), 9)
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    open(path, "wb").write(out)


os.makedirs(OUT_DIR, exist_ok=True)
w, h, pix = read_png(SRC)
small = downsample(w, h, pix, TARGET, TARGET)
write_png(OUT_192, TARGET, TARGET, small)
# 512 — просто копия источника
import shutil
shutil.copy(SRC, OUT_512)
print("wrote", OUT_192, os.path.getsize(OUT_192), "bytes")
print("wrote", OUT_512, os.path.getsize(OUT_512), "bytes")
