# -*- coding: utf-8 -*-
"""画面合成：字号/字体/字幕/章节牌/光标/转场/片头尾卡"""
import json
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

VW, VH = 1920, 1080

FONT_SERIF = r"C:\Windows\Fonts\STZHONGS.TTF"
FONT_KAI = r"C:\Windows\Fonts\STKAITI.TTF"
FONT_SANS = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"
FONT_LATIN = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"

INK = (24, 33, 46)
INK_D = (14, 20, 30)
PAPER = (250, 248, 243)
GOLD = (201, 169, 97)
GOLD_L = (226, 205, 150)
BLUE = (60, 96, 140)
RED = (168, 74, 58)

_font_cache = {}


def font(path, size):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


def tracked(draw, xy, text, fnt, fill, tracking=0, anchor='la', shadow=None):
    """带字距的文字绘制；anchor 只支持水平 l/m/r + 垂直 a/m/s(baseline近似)"""
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    x, y = xy
    if anchor[0] == 'm':
        x -= total / 2
    elif anchor[0] == 'r':
        x -= total
    if anchor[1] == 'm':
        y -= fnt.size / 2
    elif anchor[1] == 's':
        y -= fnt.size
    for ch, w in zip(text, widths):
        if ch != ' ':
            if shadow:
                draw.text((x + shadow[0], y + shadow[1]), ch, font=fnt, fill=shadow[2])
            draw.text((x, y), ch, font=fnt, fill=fill)
        x += w + tracking
    return total


def text_size(draw, text, fnt, tracking=0):
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    return sum(widths) + tracking * max(0, len(text) - 1)


# ---------------- 光标 ----------------
def cursor_sprite(scale=1.0, pressed=False):
    s = int(64 * scale)
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = s // 2
    r = s * 0.30
    # 外圈柔光
    for i in range(6, 0, -1):
        rr = r * (1 + i * 0.22)
        a = int(26 - i * 3)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(201, 169, 97, max(0, a)))
    # 金环
    w = max(2, int(s * 0.055))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(244, 238, 222, 235), width=w)
    # 内点
    ir = r * 0.34 * (1.25 if pressed else 1.0)
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=(255, 255, 255, 255))
    d.ellipse([cx - ir * 0.62, cy - ir * 0.62, cx + ir * 0.62, cy + ir * 0.62], fill=(201, 169, 97, 255))
    return img


def ripple_sprite(scale=1.0):
    s = int(150 * scale)
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s // 2
    for i in range(3):
        rr = c * (0.42 + i * 0.16)
        d.ellipse([c - rr, c - rr, c + rr, c + rr], outline=(226, 205, 150, int(150 - i * 45)), width=max(2, int(3 * scale)))
    return img


# ---------------- 字幕 ----------------
class SubtitleRenderer:
    def __init__(self, scale=1.0):
        self.s = scale
        self.size = int(38 * scale)
        self.fnt = font(FONT_SERIF, self.size)
        self.small = font(FONT_LATIN, int(17 * scale))
        self.cache = {}

    def _panel(self, text, alpha=255):
        # 自动两行折行（每行不超过 26 字）
        max_chars = 26
        lines = []
        cur = ''
        for ch in text:
            cur += ch
            if len(cur) >= max_chars and ch in '，。；、？！—…':
                lines.append(cur)
                cur = ''
        if cur:
            if lines and len(cur) < 6:
                lines[-1] += cur
            else:
                lines.append(cur)
        if len(lines) > 2:
            lines = [lines[0], ''.join(lines[1:])]
        s = self.s
        pad_x, pad_y = int(34 * s), int(20 * s)
        line_h = int(self.size * 1.52)
        probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        wmax = max(text_size(probe, ln, self.fnt) for ln in lines)
        bw = int(wmax + pad_x * 2 + 26 * s)
        bh = int(line_h * len(lines) + pad_y * 2)
        img = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        # 底板：墨色半透明 + 上缘金色细线 + 左侧印章式短线
        d.rectangle([0, 0, bw - 1, bh - 1], fill=(15, 21, 31, int(202 * alpha / 255)))
        d.line([(0, 0), (bw, 0)], fill=(201, 169, 97, 110), width=max(1, int(1.4 * s)))
        d.rectangle([0, 0, int(4 * s), bh], fill=(201, 169, 97, 205))
        y = pad_y
        for ln in lines:
            d.text((pad_x + int(12 * s), y), ln, font=self.fnt, fill=(250, 248, 243, 246),
                   stroke_width=max(1, int(0.8 * s)), stroke_fill=(12, 17, 26, 190))
            y += line_h
        return img

    def draw(self, frame, text, alpha=1.0, y_bottom=None):
        if text not in self.cache:
            self.cache[text] = self._panel(text)
        panel = self.cache[text]
        if alpha < 0.999:
            panel = panel.copy()
            a = panel.split()[3].point(lambda v: int(v * alpha))
            panel.putalpha(a)
        x = (frame.width - panel.width) // 2
        y = y_bottom if y_bottom is not None else frame.height - panel.height - int(74 * self.s)
        frame.paste(panel, (x, y), panel)
        return frame


# ---------------- 章节牌 ----------------
class SlateRenderer:
    def __init__(self, scale=1.0):
        self.s = scale
        self.f_num = font(FONT_LATIN, int(21 * scale))
        self.f_name = font(FONT_SERIF, int(30 * scale))
        self.f_en = font(FONT_LATIN, int(14 * scale))
        self.cache = {}

    def _render(self, no, name, en):
        s = self.s
        probe = ImageDraw.Draw(Image.new('RGB', (8, 8)))
        w1 = text_size(probe, no, self.f_num, 3 * s)
        w2 = text_size(probe, name, self.f_name, 5 * s)
        w3 = text_size(probe, en, self.f_en, 3 * s)
        gap = 16 * s
        bw = int(28 * s + w1 + gap + 1 + gap + w2 + gap + w3 + 30 * s)
        bh = int(52 * s)
        img = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, bw - 1, bh - 1], fill=(14, 20, 30, 150))
        d.rectangle([0, 0, bw - 1, bh - 1], outline=(201, 169, 97, 90), width=1)
        d.rectangle([0, 0, int(3 * s), bh], fill=(201, 169, 97, 230))
        x = 16 * s
        d.text((x, (bh - self.f_num.size) / 2 - 2 * s), no, font=self.f_num, fill=GOLD)
        x += w1 + gap
        d.line([(x, bh * 0.24), (x, bh * 0.76)], fill=(201, 169, 97, 120), width=1)
        x += gap
        tracked(d, (x, (bh - self.f_name.size) / 2 - 7 * s), name, self.f_name, PAPER, 5 * s)
        x += w2 + gap
        d.text((x, (bh - self.f_en.size) / 2 + 4 * s), en, font=self.f_en, fill=(201, 169, 97, 190))
        return img

    def draw(self, frame, no, name, en, alpha=1.0, y=None):
        key = (no, name, en)
        if key not in self.cache:
            self.cache[key] = self._render(no, name, en)
        spr = self.cache[key]
        if alpha < 0.999:
            spr = spr.copy()
            spr.putalpha(spr.split()[3].point(lambda v: int(v * alpha)))
        x = (frame.width - spr.width) // 2
        yy = y if y is not None else int(24 * self.s)
        frame.paste(spr, (x, yy), spr)
        return frame


# ---------------- 转场 ----------------
def _fbm(w, h, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp = 1.0
    for o in range(octaves):
        gw, gh = max(2, w >> (octaves - o + 1)), max(2, h >> (octaves - o + 1))
        g = rng.random((gh, gw)).astype(np.float32)
        layer = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0
        out += layer * amp
        amp *= 0.55
    out -= out.min()
    out /= max(1e-6, out.max())
    return out


def make_delay_shard(w=480, h=270, seed=7, cells=110):
    """碎瓷状延迟图：以撞击点为中心的 Voronoi 瓷片 + 每片随机延迟"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * 0.5, h * 0.46
    seeds = []
    for i in range(cells):
        ang = rng.uniform(0, 2 * math.pi)
        rad = (rng.uniform(0, 1) ** 0.55) * 0.78
        seeds.append((cx + math.cos(ang) * rad * w * 0.62,
                      cy + math.sin(ang) * rad * h * 0.62))
    best = None
    cell = np.zeros((h, w), np.int32)
    for i, (px, py) in enumerate(seeds):
        d2 = (xx - px) ** 2 + (yy - py) ** 2
        if best is None:
            best = d2
            cell[:] = i
        else:
            m = d2 < best
            best[m] = d2[m]
            cell[m] = i
    dist = np.sqrt(best)
    dist /= max(1e-6, dist.max())
    jit = rng.random(cells).astype(np.float32)
    delay = dist * 0.62 + jit[cell] * 0.38
    delay += _fbm(w, h, seed + 3, 3) * 0.05
    delay -= delay.min()
    delay /= max(1e-6, delay.max())
    return delay.astype(np.float32)


def make_delay_ink(w=480, h=270, seed=11):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * 0.52, h * 0.44
    d = np.sqrt(((xx - cx) / w) ** 2 + ((yy - cy) / h) ** 2) * 2.3
    n = _fbm(w, h, seed, 4)
    delay = d * 0.72 + n * 0.42
    delay -= delay.min()
    delay /= max(1e-6, delay.max())
    return delay.astype(np.float32)


_DELAY_CACHE = {}


def get_delay(kind, seed, w=1920, h=1080):
    key = (kind, seed, w, h)
    if key in _DELAY_CACHE:
        return _DELAY_CACHE[key]
    base_w = 480
    base_h = int(480 * h / w)
    if kind == 'shard':
        m = make_delay_shard(base_w, base_h, seed)
    else:
        m = make_delay_ink(base_w, base_h, seed)
    img = Image.fromarray((m * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    _DELAY_CACHE[key] = arr
    return arr


def blend_reveal(fa, fb, p, kind, seed, tint=(201, 169, 97)):
    """按延迟图揭示：p 0→1，fb 逐渐替换 fa；边沿带光"""
    delay = get_delay(kind, seed, fb.width, fb.height)
    soft = 0.28
    mask = np.clip((p * 1.35 - delay) / soft, 0.0, 1.0)
    a = np.asarray(fa, dtype=np.float32) * (1.0 - 0.22 * p)
    b = np.asarray(fb, dtype=np.float32)
    m3 = mask[:, :, None]
    out = a * (1.0 - m3) + b * m3
    # 边沿辉光：mask 处于过渡带的位置染上金色/青蓝
    edge = np.exp(-((mask - 0.38) ** 2) / (2 * 0.085 ** 2))
    active = 1.0 - np.clip((p - 0.80) / 0.20, 0.0, 1.0)
    glow = (edge * active * 0.62)[:, :, None]
    tint_arr = np.array(tint, dtype=np.float32)[None, None, :]
    out = out * (1 - glow * 0.5) + tint_arr * glow * 0.55
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def vignette(frame, strength=0.22):
    w, h = frame.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2
    r = np.sqrt(((xx - cx) / (w * 0.62)) ** 2 + ((yy - cy) / (h * 0.62)) ** 2)
    v = np.clip(1.0 - strength * np.clip(r - 0.55, 0, 3) ** 1.6, 0.55, 1.0)[:, :, None]
    arr = np.asarray(frame, dtype=np.float32) * v
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# ---------------- 片头 / 尾卡 ----------------
_seal_cache = {}


def draw_seal(img, xy, text='惜物重生', size=92, color=RED):
    key = (text, size, color)
    if key not in _seal_cache:
        s = size
        box = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(box)
        d.rectangle([2, 2, s - 3, s - 3], outline=color + (255,), width=max(2, s // 28))
        f = font(FONT_SERIF, int(s * 0.36))
        # 2x2 排列
        chars = text[:4]
        for i, ch in enumerate(chars):
            cx = s * (0.30 if i % 2 == 0 else 0.70)
            cy = s * (0.28 if i < 2 else 0.72)
            bb = d.textbbox((0, 0), ch, font=f)
            d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2 - bb[1]), ch, font=f, fill=color + (255,))
        _seal_cache[key] = box
    img.paste(_seal_cache[key], (int(xy[0]), int(xy[1])), _seal_cache[key])


def make_intro_bg(still_path):
    """片头底图：把实拍首页压暗、去饱和，作为题字衬底"""
    bg = Image.open(still_path).convert('RGB').resize((VW, VH), Image.LANCZOS)
    arr = np.asarray(bg, dtype=np.float32)
    gray = arr.mean(axis=2, keepdims=True)
    arr = arr * 0.35 + gray * 0.35
    arr *= 0.42
    bg = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    bg = bg.filter(ImageFilter.GaussianBlur(3))
    return bg


class IntroCard:
    """片头：金线裂纹生长 → 题字浮现"""

    def __init__(self, bg, scale=1.0):
        self.bg = bg
        self.s = scale
        rng = np.random.default_rng(20)
        # 主裂纹：从画面中心向外折线生长
        pts = [(VW * 0.5, VH * 0.58)]
        ang = -math.pi / 2 + 0.25
        x, y = pts[0]
        for i in range(9):
            ang += rng.normal(0, 0.38)
            x += math.cos(ang) * (70 + i * 8)
            y += math.sin(ang) * (70 + i * 8)
            pts.append((x, y))
        self.main = pts
        self.branches = []
        for k in range(5):
            i = 2 + k
            if i >= len(pts) - 1:
                break
            bx, by = pts[i]
            a2 = ang + rng.choice([-1, 1]) * rng.uniform(0.6, 1.2)
            seg = [(bx, by)]
            for j in range(3):
                a2 += rng.normal(0, 0.3)
                bx += math.cos(a2) * 55
                by += math.sin(a2) * 55
                seg.append((bx, by))
            self.branches.append(seg)
        self.f_title = font(FONT_SERIF, int(132 * scale))
        self.f_sub = font(FONT_SERIF, int(30 * scale))
        self.f_en = font(FONT_LATIN, int(16 * scale))

    def _crack(self, img, prog):
        s = self.s
        layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        n = len(self.main)
        upto = int(np.clip(prog, 0, 1) * (n - 1))
        # 光晕层
        glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        for pts in [self.main] + self.branches:
            seg = pts[:max(2, upto + 1)] if pts is self.main else pts
            for i in range(len(seg) - 1):
                gd.line([seg[i], seg[i + 1]], fill=(201, 169, 97, 60), width=int(9 * s))
                d.line([seg[i], seg[i + 1]], fill=(235, 214, 160, 235), width=max(1, int(1.8 * s)))
        glow = glow.filter(ImageFilter.GaussianBlur(int(7 * s)))
        img.paste(glow, (0, 0), glow)
        img.paste(layer, (0, 0), layer)

    def render(self, t, duration):
        img = self.bg.copy()
        # 裂纹生长 0.1→1.3s
        self._crack(img, np.clip((t - 0.15) / 1.15, 0, 1))
        d = ImageDraw.Draw(img)
        # 题字 1.0s 起逐字浮现
        if t > 0.85:
            p = np.clip((t - 0.85) / 1.35, 0, 1)
            chars = '碎瓷重圆'
            f = self.f_title
            track = 26 * self.s
            widths = [d.textlength(c, font=f) for c in chars]
            total = sum(widths) + track * (len(chars) - 1)
            x0 = VW / 2 - total / 2
            base_y = VH * 0.40
            for i, (c, w) in enumerate(zip(chars, widths)):
                q = np.clip((p * 4 - i) / 1.6, 0, 1)
                if q <= 0:
                    continue
                a = int(255 * q)
                off = (1 - q) * 26 * self.s
                layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
                ld = ImageDraw.Draw(layer)
                ld.text((x0 + sum(widths[:i]) + track * i, base_y + off), c, font=f,
                        fill=(250, 248, 243, a), stroke_width=max(1, int(2 * self.s)),
                        stroke_fill=(10, 14, 22, int(a * 0.5)))
                img.paste(layer, (0, 0), layer)
        # 副标题
        if t > 2.05:
            p = np.clip((t - 2.05) / 0.8, 0, 1)
            a = int(235 * p)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            tracked(ld, (VW / 2, VH * 0.545), '数字青花瓷修复体验 · 项目评审演示', self.f_sub,
                    (226, 205, 150, a), 6 * self.s, anchor='ma')
            tracked(ld, (VW / 2, VH * 0.605), 'PORCELAIN  ·  REUNITED   /   PROJECT  SHOWCASE',
                    self.f_en, (201, 169, 97, int(a * 0.75)), 4 * self.s, anchor='ma')
            img.paste(layer, (0, 0), layer)
        # 底部细线
        if t > 2.3:
            p = np.clip((t - 2.3) / 0.9, 0, 1)
            line = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(line)
            half = 210 * self.s * p
            ld.line([(VW / 2 - half, VH * 0.665), (VW / 2 + half, VH * 0.665)], fill=(201, 169, 97, 190), width=1)
            img.paste(line, (0, 0), line)
        return img


class OutroCard:
    """尾卡：技术亮点归纳 + 落款"""

    def __init__(self, bullets, scale=1.0):
        self.s = scale
        self.bullets = bullets
        self.f_kicker = font(FONT_LATIN, int(18 * scale))
        self.f_title = font(FONT_SERIF, int(56 * scale))
        self.f_no = font(FONT_LATIN, int(26 * scale))
        self.f_bt = font(FONT_SERIF, int(34 * scale))
        self.f_bd = font(FONT_SANS, int(21 * scale))
        self.f_close = font(FONT_SERIF, int(38 * scale))
        self.f_foot = font(FONT_SANS, int(19 * scale))
        rng = np.random.default_rng(5)
        # 青花纹样底纹：细线同心弧 + 点
        self.deco = Image.new('RGBA', (VW, VH), (0, 0, 0, 0))
        d = ImageDraw.Draw(self.deco)
        for i in range(7):
            cx, cy = VW * (0.08 + 0.15 * i), VH * (0.16 + 0.13 * (i % 3))
            r = 90 + 26 * i
            d.arc([cx - r, cy - r, cx + r, cy + r], 200, 340, fill=(96, 138, 180, 26), width=2)
        for i in range(160):
            x, y = rng.uniform(0, VW), rng.uniform(0, VH)
            d.ellipse([x, y, x + 2, y + 2], fill=(120, 160, 200, 18))
        self.deco = self.deco.filter(ImageFilter.GaussianBlur(0.6))
        self.base = self._base()

    def _base(self):
        yy, xx = np.mgrid[0:VH, 0:VW].astype(np.float32)
        g = np.clip(1 - np.sqrt(((xx - VW / 2) / (VW * 0.75)) ** 2 + ((yy - VH * 0.42) / (VH * 0.85)) ** 2), 0, 1)
        base = np.zeros((VH, VW, 3), np.float32)
        base[:, :, 0] = 12 + 16 * g
        base[:, :, 1] = 17 + 21 * g
        base[:, :, 2] = 26 + 30 * g
        img = Image.fromarray(base.astype(np.uint8)).convert('RGBA')
        img = Image.alpha_composite(img, self.deco)
        return img

    def render(self, t, duration):
        img = self.base.copy()
        d = ImageDraw.Draw(img)
        # 顶部：小字 + 标题
        if t > 0.15:
            p = np.clip((t - 0.15) / 0.7, 0, 1)
            a = int(210 * p)
            tracked(d, (VW / 2, 96 * self.s), 'HIGHLIGHTS  /  TECHNOLOGY', self.f_kicker,
                    (201, 169, 97, a), 5 * self.s, anchor='ma')
            tracked(d, (VW / 2, 132 * self.s), '项目亮点 · 技术优势', self.f_title,
                    (250, 248, 243, int(250 * p)), 10 * self.s, anchor='ma')
            lw = 300 * self.s * p
            d.line([(VW / 2 - lw, 214 * self.s), (VW / 2 + lw, 214 * self.s)], fill=(201, 169, 97, int(160 * p)), width=1)

        # 六条：两列三行
        col_w = 760 * self.s
        row_h = 118 * self.s
        x0 = VW / 2 - col_w - 30 * self.s
        y0 = 268 * self.s
        for i, (no, title, desc) in enumerate(self.bullets):
            t_start = 0.75 + i * 0.92
            if t < t_start:
                continue
            p = np.clip((t - t_start) / 0.55, 0, 1)
            col, row = i % 2, i // 2
            x = x0 + col * (col_w + 60 * self.s)
            y = y0 + row * row_h
            off = (1 - p) * 18 * self.s
            a = int(255 * p)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            # 编号 + 发丝线
            ld.text((x, y + off + 4 * self.s), no, font=self.f_no, fill=(201, 169, 97, a))
            ld.line([(x + 52 * self.s, y + off + 4 * self.s), (x + 52 * self.s, y + off + 62 * self.s)],
                    fill=(201, 169, 97, int(a * 0.35)), width=1)
            tracked(ld, (x + 74 * self.s, y + off), title, self.f_bt, (250, 248, 243, a), 4 * self.s)
            ld.text((x + 74 * self.s, y + off + 52 * self.s), desc, font=self.f_bd, fill=(170, 184, 199, int(a * 0.95)))
            img.paste(layer, (0, 0), layer)

        # 落款
        if t > 6.6:
            p = np.clip((t - 6.6) / 0.9, 0, 1)
            a = int(255 * p)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            ld.line([(VW / 2 - 280 * self.s, 690 * self.s), (VW / 2 + 280 * self.s, 690 * self.s)],
                    fill=(201, 169, 97, int(120 * p)), width=1)
            tracked(ld, (VW / 2, 724 * self.s), '修复一件瓷器，接续一段生活。', self.f_close,
                    (250, 248, 243, a), 8 * self.s, anchor='ma')
            tracked(ld, (VW / 2, 786 * self.s), '《碎瓷重圆》· 数字青花瓷修复体验 · 项目评审演示', self.f_foot,
                    (201, 169, 97, int(a * 0.85)), 3 * self.s, anchor='ma')
            tracked(ld, (VW / 2, 848 * self.s), '九屏流程  ·  六件器物  ·  四十八段记忆  ·  三处写实考察  ·  四种修复选择',
                    self.f_foot, (170, 184, 199, int(a * 0.8)), 2 * self.s, anchor='ma')
            img.paste(layer, (0, 0), layer)
            draw_seal(img, (VW / 2 + 356 * self.s, 700 * self.s), '惜物重生', int(86 * self.s))

        # 收尾压暗
        if t > duration - 1.4:
            k = np.clip((t - (duration - 1.4)) / 1.4, 0, 1)
            arr = np.asarray(img.convert('RGB'), dtype=np.float32) * (1 - k * 0.88)
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('RGBA')
        return img


def shell_frame(w, h, scale=1.0):
    """手机外壳 PNG（用于画中画）"""
    pad = int(14 * scale)
    r = int(34 * scale)
    img = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=r + pad // 2,
                        fill=(22, 28, 38, 245), outline=(201, 169, 97, 150), width=max(1, int(1.5 * scale)))
    d.rounded_rectangle([pad // 2, pad // 2 + int(6 * scale), img.width - pad // 2, img.height - pad // 2 - int(6 * scale)],
                        radius=r, outline=(90, 100, 116, 120), width=1)
    return img
