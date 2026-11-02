# -*- coding: utf-8 -*-
"""渲染主程序：读取时间线 → 解码实拍 → 合成叠加层 → 输出 MP4"""
import json
import os
import subprocess
import sys
import time
import numpy as np
from PIL import Image, ImageDraw

import edl
import visual as V

FFMPEG = r"C:\Users\17355\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
OUT_DIR = r"D:\数字媒体\_videotools\out"
STILL = r"D:\数字媒体\_videotools\review\A-main\t003.png"

W = int(os.environ.get('VW', '1920'))
H = int(os.environ.get('VH', '1080'))
FPS = int(os.environ.get('FPS', '30'))
PREVIEW = W < 1000
TD = 0.85
SLATE_DUR = 3.4


def load_timing():
    out = {}
    for k, p in edl.TIMING.items():
        with open(p, 'r', encoding='utf-8') as f:
            d = json.load(f)
        pts = [dict(x=pp['x'], y=pp['y'], t=pp['t'] / 1000.0, type=pp['type']) for pp in d['pointer']]
        pts.sort(key=lambda q: q['t'])
        out[k] = pts
    return out


POINTERS = load_timing()


class Reader:
    def __init__(self, take, start, count, w=W, h=H):
        self.take = take
        self.start = start
        self.count = count
        self.w, self.h = w, h
        self.i = 0
        self.proc = None

    def _open(self):
        cmd = [FFMPEG, '-v', 'error', '-ss', f'{self.start:.3f}', '-i', edl.TAKES[self.take],
               '-frames:v', str(self.count), '-vf', f'scale={self.w}:{self.h}:flags=bicubic',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10 ** 8)

    def next(self):
        if self.i == 0:
            self._open()
        need = self.w * self.h * 3
        buf = self.proc.stdout.read(need)
        self.i += 1
        if len(buf) < need:
            return None
        return Image.frombytes('RGB', (self.w, self.h), buf)

    def close(self):
        if self.proc:
            try:
                self.proc.stdout.close()
            except Exception:
                pass
            self.proc.kill()
            self.proc = None


def chapter_segments():
    chs = [dict(c) for c in edl.CHAPTERS]
    for c in chs:
        c['segs'] = [list(s) for s in c['segs']]
    for i in range(1, len(chs)):
        style = chs[i].get('style')
        prev, cur = chs[i - 1], chs[i]
        if not style or not cur['segs'] or not prev['segs']:
            continue
        pt, pa, pb = prev['segs'][-1]
        prev['segs'][-1][2] = pb - TD
        ct, ca, cb = cur['segs'][0]
        cur['segs'][0][1] = ca + TD
        cur['trans'] = dict(kind=style, a=(pt, pb - TD), b=(ct, ca), dur=TD, seed=i * 7 + 3)
    return chs


def build_parts(chs):
    parts = []
    t = 0.0
    for idx, c in enumerate(chs):
        if c['key'] == 'intro':
            d = edl.INTRO_DESIGN
            c['_t_start'] = t
            parts.append(dict(kind='intro', start=t, dur=d, chapter=c))
            t += d
            ft, fa, fb = edl.INTRO_FOOT
            d2 = fb - fa
            parts.append(dict(kind='clip', start=t, dur=d2, take=ft, src=fa, chapter=c, chidx=idx, dissolve_in=0.75))
            t += d2
            continue
        if c['key'] == 'outro':
            d = float(os.environ.get('OUTRO', '18.2'))
            c['_t_start'] = t
            parts.append(dict(kind='outro', start=t, dur=d, chapter=c))
            t += d
            continue
        if c.get('trans'):
            tr = c['trans']
            c['_t_start'] = t
            parts.append(dict(kind='trans', start=t, dur=tr['dur'], a=tr['a'], b=tr['b'],
                              style=tr['kind'], seed=tr['seed'], chapter=c, chidx=idx))
            t += tr['dur']
        else:
            c['_t_start'] = t
        for (tk, a, b) in c['segs']:
            d = b - a
            if d <= 0.05:
                continue
            parts.append(dict(kind='clip', start=t, dur=d, take=tk, src=a, chapter=c, chidx=idx))
            t += d
    return parts, t


class Overlay:
    def __init__(self, w, h):
        self.s = w / 1920.0
        self.w, self.h = w, h
        self.subs = V.SubtitleRenderer(self.s)
        self.slates = V.SlateRenderer(self.s)
        self.cursor = V.cursor_sprite(self.s)
        self.cursor_p = V.cursor_sprite(self.s, pressed=True)
        self.ripple = V.ripple_sprite(self.s)
        self.f_mark = V.font(V.FONT_SANS, max(10, int(15 * self.s)))

    def pointer_at(self, take, t):
        pts = POINTERS.get(take) or []
        if not pts:
            return None
        lo, hi = 0, len(pts) - 1
        if t <= pts[0]['t']:
            return pts[0]
        if t >= pts[-1]['t']:
            return pts[-1]
        while lo < hi - 1:
            mid = (lo + hi) // 2
            if pts[mid]['t'] <= t:
                lo = mid
            else:
                hi = mid
        return pts[lo]

    def draw_cursor(self, img, take, t, alpha=1.0):
        p = self.pointer_at(take, t)
        if not p:
            return
        pressed = False
        for q in POINTERS.get(take, []):
            if q['type'] == 'press' and 0 <= t - q['t'] < 0.16:
                pressed = True
                break
        spr = self.cursor_p if pressed else self.cursor
        if alpha < 0.999:
            spr = spr.copy()
            spr.putalpha(spr.getchannel('A').point(lambda v: int(v * alpha)))
        img.paste(spr, (int(p['x'] * self.s - spr.width / 2), int(p['y'] * self.s - spr.height / 2)), spr)
        for q in POINTERS.get(take, []):
            if q['type'] != 'press':
                continue
            dt = t - q['t']
            if 0 <= dt < 0.5:
                k = dt / 0.5
                r = 0.26 + k * 0.95
                spr2 = self.ripple.resize((max(4, int(self.ripple.width * r)),) * 2, Image.BILINEAR)
                spr2.putalpha(spr2.getchannel('A').point(lambda v: int(v * (1 - k) ** 1.3 * 0.9)))
                img.paste(spr2, (int(q['x'] * self.s - spr2.width / 2), int(q['y'] * self.s - spr2.height / 2)), spr2)

    def draw_watermark(self, img):
        d = ImageDraw.Draw(img)
        txt = '碎瓷重圆  ·  项目评审演示'
        tw = V.text_size(d, txt, self.f_mark, 3 * self.s)
        d.text(((self.w - tw) / 2, self.h - 24 * self.s), txt, font=self.f_mark, fill=(201, 169, 97, 90))

    def draw_slate(self, img, chapter, t_in_chapter):
        if t_in_chapter > SLATE_DUR or not chapter.get('no'):
            return
        a = 1.0
        if t_in_chapter < 0.45:
            a = t_in_chapter / 0.45
        elif t_in_chapter > SLATE_DUR - 0.7:
            a = max(0.0, (SLATE_DUR - t_in_chapter) / 0.7)
        self.slates.draw(img, chapter['no'], chapter['name'], chapter['en'], a)

    def draw_cues(self, img, cues, gt):
        for (t0, t1, text) in cues:
            if t0 - 0.24 <= gt <= t1 + 0.24:
                a = 1.0
                if gt < t0 + 0.20:
                    a = (gt - (t0 - 0.24)) / 0.44
                elif gt > t1 - 0.20:
                    a = max(0.0, (t1 + 0.24 - gt) / 0.44)
                self.subs.draw(img, text, min(1.0, max(0.0, a)))


def cues_absolute(chs):
    out = []
    for c in chs:
        base = c.get('_t_start')
        if base is None:
            continue
        for (off, dur, text) in edl.CUES.get(c['key'], []):
            out.append((base + off, base + off + dur, text))
    return out


def alpha_over(dst, src, x, y, alpha=1.0):
    if alpha <= 0.01:
        return
    if alpha < 0.999:
        src = src.copy()
        src.putalpha(src.getchannel('A').point(lambda v: int(v * alpha)))
    dst.paste(src, (int(x), int(y)), src)


def main():
    t_start = time.time()
    chs = chapter_segments()
    parts, total = build_parts(chs)
    if os.environ.get('ONLY_INTRO'):
        parts = [p for p in parts if p['start'] < edl.INTRO_DESIGN + (edl.INTRO_FOOT[2] - edl.INTRO_FOOT[1]) - 0.01]
        total = edl.INTRO_DESIGN + (edl.INTRO_FOOT[2] - edl.INTRO_FOOT[1])
    cues = cues_absolute(chs)
    n_frames = int(round(total * FPS))
    os.makedirs(OUT_DIR, exist_ok=True)
    tag = os.environ.get('TAG', 'full')
    out_mp4 = os.path.join(OUT_DIR, f'{tag}.mp4')
    print(f'[build] {len(parts)} parts, {total:.1f}s, {n_frames} frames @ {FPS}fps, {W}x{H}', flush=True)
    for c in chs:
        if c.get('_t_start') is not None:
            dur = sum(b - a for (_, a, b) in c['segs']) + (TD if c.get('trans') else 0)
            print(f'   {c["key"]:12s} {c["_t_start"]:7.2f}s  +{dur:5.2f}s  {c["name"]}', flush=True)

    ov = Overlay(W, H)
    bg_still = V.make_intro_bg(STILL)
    # 片头/尾卡按 1920x1080 虚拟画布绘制，再缩放到输出尺寸
    intro = V.IntroCard(bg_still, 1.0)
    outro = V.OutroCard(edl.OUTRO_BULLETS, 1.0)

    # 手机画中画素材
    pip_scale = (edl.PIP['h'] * W / 1920.0) / 932.0
    pip_w = int(430 * pip_scale)
    pip_h = int(932 * pip_scale)
    pip_shell = V.shell_frame(pip_w, pip_h, pip_scale)

    cmd = [FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-c:v', 'libx264', '-preset', 'veryfast' if PREVIEW else 'medium',
           '-crf', '27' if PREVIEW else '17', '-pix_fmt', 'yuv420p',
           '-x264-params', 'keyint=60:min-keyint=30', '-movflags', '+faststart', out_mp4]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    frame_idx = 0
    intro_last = None
    pip_rd = None
    pip_used = False

    for part in parts:
        kind = part['kind']
        dur = part['dur']
        n = max(1, int(round(dur * FPS)))
        ch = part['chapter']
        rd = None
        rdA = rdB = None
        if kind == 'clip':
            rd = Reader(part['take'], part['src'], n + 2)
        elif kind == 'trans':
            rdA = Reader(part['a'][0], part['a'][1], n + 2)
            rdB = Reader(part['b'][0], part['b'][1], n + 2)

        # 工程章节：准备画中画解码
        pip_active = (ch['key'] == 'system' and kind == 'clip')
        if pip_active and not pip_used:
            pip_rd = Reader(edl.PIP['take'], edl.PIP['src'], int(edl.PIP['dur'] * FPS) + 4, w=pip_w, h=pip_h)
            pip_used = True

        ch_base = ch.get('_t_start', part['start'])
        for i in range(n):
            gt = part['start'] + i / FPS
            if kind == 'intro':
                frame = intro.render(gt, dur).convert('RGB')
                if (W, H) != (1920, 1080):
                    frame = frame.resize((W, H), Image.LANCZOS)
                intro_last = frame.copy()
                ov.draw_cues(frame, cues, gt)
            elif kind == 'outro':
                frame = outro.render(gt - part['start'], dur).convert('RGB')
                if (W, H) != (1920, 1080):
                    frame = frame.resize((W, H), Image.LANCZOS)
                ov.draw_cues(frame, cues, gt)
            elif kind == 'clip':
                fa = rd.next()
                if fa is None:
                    fa = Image.new('RGB', (W, H), (10, 14, 20))
                frame = fa
                # 片头 → 实拍 溶解
                if part.get('dissolve_in') and intro_last is not None:
                    d = part['dissolve_in']
                    if i / FPS < d:
                        a = i / FPS / d
                        a = a * a * (3 - 2 * a)
                        arr = np.asarray(fa, dtype=np.float32) * a + np.asarray(intro_last, dtype=np.float32) * (1 - a)
                        frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
                # 手机画中画
                if pip_active and pip_rd is not None:
                    t_in = gt - part['start']
                    p0 = edl.PIP['start']
                    p1 = p0 + edl.PIP['dur']
                    if p0 - 0.05 <= t_in <= p1 + 0.05:
                        pf = pip_rd.next()
                        if pf is not None:
                            k_in = min(1.0, max(0.0, (t_in - p0) / edl.PIP['appear']))
                            k_out = min(1.0, max(0.0, (p1 - t_in) / edl.PIP['vanish']))
                            a = min(k_in, k_out)
                            e = a * a * (3 - 2 * a)
                            x = (edl.PIP['x'] + (1 - e) * 150) * W / 1920.0
                            y = edl.PIP['y'] * W / 1920.0
                            sh = pip_shell.copy()
                            inner = pf.convert('RGBA')
                            shx = int(14 * pip_scale)
                            sh.paste(inner, (shx, shx + int(2 * pip_scale)))
                            alpha_over(frame, sh, x, y, a)
                ov.draw_cursor(frame, part['take'], part['src'] + i / FPS)
                ov.draw_watermark(frame)
                ov.draw_slate(frame, ch, gt - ch_base)
                ov.draw_cues(frame, cues, gt)
            else:
                fa = rdA.next()
                fb = rdB.next()
                if fa is None:
                    fa = Image.new('RGB', (W, H), (10, 14, 20))
                if fb is None:
                    fb = Image.new('RGB', (W, H), (10, 14, 20))
                p = (i + 1) / n
                pe = p * p * (3 - 2 * p)
                tint = (201, 169, 97) if part['style'] == 'shard' else (116, 166, 208)
                frame = V.blend_reveal(fa, fb, pe, 'shard' if part['style'] == 'shard' else 'ink', part['seed'], tint=tint)
                ov.draw_cursor(frame, part['b'][0], part['b'][1] + i / FPS, alpha=min(1.0, max(0.0, (p - 0.3) / 0.45)))
                ov.draw_watermark(frame)
                ov.draw_slate(frame, ch, gt - ch_base)
                ov.draw_cues(frame, cues, gt)
            enc.stdin.write(frame.tobytes())
            frame_idx += 1
            if frame_idx % 90 == 0:
                el = time.time() - t_start
                print(f'  {frame_idx}/{n_frames}  {frame_idx / el:.1f} fps  t={gt:.1f}s', flush=True)
        for r in (rd, rdA, rdB):
            if r:
                r.close()

    enc.stdin.close()
    enc.wait()
    if pip_rd:
        pip_rd.close()
    with open(os.path.join(OUT_DIR, f'{tag}.total'), 'w') as f:
        f.write(f'{total:.3f}\n')
    meta = []
    for c in chs:
        if c.get('_t_start') is None:
            continue
        d = sum(b - a for (_, a, b) in c['segs'])
        meta.append(dict(key=c['key'], no=c['no'], name=c['name'], start=round(c['_t_start'], 3),
                         dur=round(d, 3), style=c.get('style')))
    with open(os.path.join(OUT_DIR, f'{tag}.chapters.json'), 'w', encoding='utf-8') as f:
        json.dump(dict(total=round(total, 3), chapters=meta), f, ensure_ascii=False, indent=1)
    print(f'[done] {out_mp4}  {total:.2f}s  in {time.time() - t_start:.0f}s', flush=True)


if __name__ == '__main__':
    main()
