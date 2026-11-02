# -*- coding: utf-8 -*-
"""配乐与音效：程序化合成古风氛围（古琴拨弦 + 长音铺底 + 低频 + 转场气声）"""
import json
import math
import os
import sys
import wave
import numpy as np

SR = 44100
OUT = r'D:\数字媒体\_videotools\out'

# D 羽调式（D F G A C）
SCALE = [0, 3, 5, 7, 10]
BASE = 62  # D4 = MIDI 62


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def env_adsr(n, a, d, s, r, sr=SR):
    a_n = max(1, int(a * sr))
    d_n = max(1, int(d * sr))
    r_n = max(1, int(r * sr))
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False),
        np.linspace(1, s, d_n, endpoint=False),
        np.full(s_n, s),
        np.linspace(s, 0, r_n),
    ])
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]


def pluck(freq, dur, amp=0.3, bright=0.55, sr=SR, seed=0):
    """拨弦：谐波叠加 + 快衰减（古琴/筝的近似）"""
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    for k in range(1, 8):
        if freq * k > sr * 0.45:
            break
        a = (1.0 / k ** 1.35) * (bright if k > 1 else 1.0)
        dec = 1.1 + 0.85 * k
        ph = rng.uniform(0, 2 * math.pi)
        out += a * np.sin(2 * math.pi * freq * k * t + ph) * np.exp(-dec * t)
    # 拨片噪声瞬态
    nt = int(min(0.02, dur) * sr)
    noise = rng.normal(0, 1, nt) * np.exp(-np.linspace(0, 9, nt)) * 0.18 * bright
    out[:nt] += noise
    out *= np.minimum(1.0, np.exp(-0.6 * t) * 1.6)
    out /= max(1e-6, np.abs(out).max())
    return out * amp


def pad(freqs, dur, amp=0.12, sr=SR, attack=1.6, release=2.4):
    n = int(dur * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)
    for i, f in enumerate(freqs):
        det = 1.0 + (i - len(freqs) / 2) * 0.0016
        for h, w in ((1, 1.0), (2, 0.32), (3, 0.12)):
            out += w * np.sin(2 * math.pi * f * det * h * t + i * 0.7)
    out /= max(1e-6, np.abs(out).max())
    e = env_adsr(n, attack, 0.4, 1.0, release, sr)
    # 慢速起伏
    lfo = 1.0 + 0.12 * np.sin(2 * math.pi * 0.07 * t)
    return out * e * lfo * amp


def noise_band(dur, lo, hi, amp=0.1, sr=SR, seed=1):
    n = int(dur * sr)
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 1, n)
    X = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    mask = np.zeros_like(freqs)
    band = (freqs >= lo) & (freqs <= hi)
    mask[band] = 1.0
    # 平滑边界
    k = 32
    mask = np.convolve(mask, np.ones(k) / k, mode='same')
    y = np.fft.irfft(X * mask, n)
    y /= max(1e-6, np.abs(y).max())
    return y * amp


def whoosh(dur=1.0, amp=0.16, sr=SR, seed=3):
    """转场气声：噪声带通 + 频率上行 + 反向包络"""
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 1, n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    mask = np.exp(-((f - 1400) ** 2) / (2 * 1100 ** 2))
    y = np.fft.irfft(X * mask, n)
    y /= max(1e-6, np.abs(y).max())
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.2
    return y * e * amp


def bell(freq, dur=2.4, amp=0.16, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)
    for k, w in ((1, 1.0), (2.7, 0.45), (5.4, 0.22), (8.1, 0.12)):
        out += w * np.sin(2 * math.pi * freq * k * t) * np.exp(-(1.2 + k * 0.55) * t)
    out /= max(1e-6, np.abs(out).max())
    return out * amp


def drum(freq=58, dur=0.9, amp=0.28, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    body = np.sin(2 * math.pi * freq * np.exp(-1.6 * t) * t) * np.exp(-3.2 * t)
    click = np.random.default_rng(9).normal(0, 1, n) * np.exp(-40 * t) * 0.25
    y = body + click
    y /= max(1e-6, np.abs(y).max())
    return y * amp


def woodblock(dur=0.22, amp=0.14, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    y = np.sin(2 * math.pi * 1180 * t) * np.exp(-32 * t) + 0.4 * np.sin(2 * math.pi * 2320 * t) * np.exp(-46 * t)
    y /= max(1e-6, np.abs(y).max())
    return y * amp


def fft_convolve(x, ir):
    n = len(x) + len(ir) - 1
    N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)]


def make_ir(dur=2.6, sr=SR, seed=4):
    n = int(dur * sr)
    rng = np.random.default_rng(seed)
    t = np.arange(n) / sr
    ir = rng.normal(0, 1, n) * np.exp(-2.4 * t)
    # 高频衰减更快
    X = np.fft.rfft(ir)
    f = np.fft.rfftfreq(n, 1 / sr)
    X *= np.exp(-f / 4200.0)
    ir = np.fft.irfft(X, n)
    ir[:int(0.012 * sr)] *= np.linspace(0, 1, int(0.012 * sr))
    ir /= max(1e-6, np.abs(ir).max())
    return ir


def add(buf, sig, at, gain=1.0):
    i = int(round(at * SR))
    if i < 0:
        cut = -i
        if cut >= len(sig):
            return
        sig = sig[cut:]
        i = 0
    if i >= len(buf):
        return
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n] * gain


MOOD = {
    'intro':     dict(root=0, pad=[0, 7, 12, 19], density=0.6, bright=0.4, perc=0.0, air=0.55),
    'start':     dict(root=0, pad=[0, 7, 12], density=0.8, bright=0.5, perc=0.0, air=0.15),
    'archive':   dict(root=0, pad=[0, 7, 10], density=0.75, bright=0.55, perc=0.0, air=0.1),
    'commission': dict(root=0, pad=[0, 7, 15], density=0.7, bright=0.6, perc=0.05, air=0.1),
    'puzzle':    dict(root=0, pad=[0, 7, 12], density=1.0, bright=0.7, perc=0.55, air=0.12),
    'scroll':    dict(root=0, pad=[0, 5, 12], density=0.55, bright=0.45, perc=0.0, air=0.2),
    'choice':    dict(root=-2, pad=[0, 6, 13], density=0.6, bright=0.4, perc=0.15, air=0.2),
    'workshop':  dict(root=0, pad=[0, 7, 12], density=0.9, bright=0.65, perc=0.5, air=0.1),
    'cert':      dict(root=5, pad=[0, 4, 7, 12], density=0.7, bright=0.75, perc=0.1, air=0.12),
    'fieldwork': dict(root=0, pad=[0, 7, 14], density=0.45, bright=0.5, perc=0.0, air=0.7),
    'exhibit':   dict(root=3, pad=[0, 5, 12], density=0.6, bright=0.6, perc=0.05, air=0.2),
    'system':    dict(root=0, pad=[0, 7, 12], density=0.65, bright=0.5, perc=0.35, air=0.1),
    'finale':    dict(root=0, pad=[0, 5, 7, 12, 16], density=0.85, bright=0.85, perc=0.3, air=0.15),
    'outro':     dict(root=5, pad=[0, 4, 7, 12, 19], density=0.5, bright=0.7, perc=0.0, air=0.15),
}


def build_audio(tag='full'):
    meta = json.load(open(os.path.join(OUT, f'{tag}.chapters.json'), encoding='utf-8'))
    total = meta['total']
    chs = meta['chapters']
    # 设计段（片头/尾卡）在渲染表里 seg 为 0：按相邻章节起点补算实际时长
    for i, c in enumerate(chs):
        if c['dur'] <= 0.01:
            nxt = chs[i + 1]['start'] if i + 1 < len(chs) else total
            c['dur'] = max(0.5, nxt - c['start'])
    n = int((total + 3.0) * SR)
    music = np.zeros(n)
    amb = np.zeros(n)
    sfx = np.zeros(n)
    rng = np.random.default_rng(2026)

    for idx, c in enumerate(chs):
        st, dur = c['start'], c['dur']
        if dur <= 0:
            continue
        m = MOOD.get(c['key'], MOOD['start'])
        root = BASE + m['root']
        # 铺底长音（跨段轻微交叠）
        freqs = [midi_hz(root - 12 + iv) for iv in m['pad']]
        p = pad(freqs, dur + 1.8, amp=0.10, attack=1.4, release=2.2)
        add(music, p, st - 0.6)
        # 低频
        low = pad([midi_hz(root - 24), midi_hz(root - 12)], dur + 1.2, amp=0.055, attack=2.0, release=2.4)
        add(music, low, st - 0.4)
        # 拨弦
        n_notes = max(1, int(dur / 2.3 * m['density']))
        motif = [0, 2, 4, 2, 3, 1, 0, 4]
        for k in range(n_notes):
            t0 = st + 0.3 + k * (dur / max(1, n_notes)) + rng.uniform(-0.12, 0.12)
            if t0 >= st + dur - 0.2:
                break
            deg = motif[(k + idx) % len(motif)]
            octv = rng.choice([0, 0, 12, 12, -12])
            note = root + SCALE[deg % len(SCALE)] + 12 * (deg // len(SCALE)) + octv
            f = midi_hz(note)
            dur_n = rng.uniform(1.6, 3.2)
            sg = pluck(f, dur_n, amp=rng.uniform(0.14, 0.26), bright=m['bright'], seed=rng.integers(1e6))
            add(music, sg, t0)
        # 节奏
        if m['perc'] > 0.2:
            beat = 60.0 / 76.0
            t0 = st + 0.2
            i = 0
            while t0 < st + dur - 0.2:
                if i % 4 == 0:
                    add(music, drum(58, 0.8, amp=0.16 * m['perc']), t0)
                else:
                    add(music, woodblock(0.2, amp=0.055 * m['perc']), t0)
                t0 += beat * 2
                i += 1
        # 气声
        if m['air'] > 0.3:
            a = noise_band(dur, 300, 2600, amp=0.05 * m['air'], seed=idx * 13 + 2)
            lfo = 0.6 + 0.4 * np.sin(2 * math.pi * 0.05 * np.arange(len(a)) / SR)
            add(amb, a * lfo, st)
        # 段首：转场气声 + 轻鼓
        if idx > 0:
            add(sfx, whoosh(0.95, amp=0.10), st - 0.45)
            add(sfx, drum(52, 1.2, amp=0.10), st - 0.05)

    # 关键音效
    key_beats = {'cert': (1.2, 0.18), 'finale': (0.8, 0.2), 'outro': (0.4, 0.16), 'scroll': (0.6, 0.12)}
    for c in chs:
        if c['key'] in key_beats:
            off, amp = key_beats[c['key']]
            add(sfx, bell(midi_hz(BASE + 7), 3.2, amp=amp), c['start'] + off)
            add(sfx, bell(midi_hz(BASE + 19), 2.6, amp=amp * 0.6), c['start'] + off + 0.12)
    # 片头裂缝声
    add(sfx, noise_band(1.4, 1500, 6500, amp=0.07, seed=77), 0.05)
    add(sfx, drum(44, 1.6, amp=0.16), 0.02)
    # 尾卡收束
    add(sfx, bell(midi_hz(BASE + 12), 4.0, amp=0.14), total - 3.4)

    # 混响
    ir = make_ir(2.6)
    wet_m = fft_convolve(music, ir) * 0.34
    wet_a = fft_convolve(amb, ir) * 0.30
    wet_s = fft_convolve(sfx, ir) * 0.42
    L = music + amb * 0.9 + sfx + wet_m + wet_a + wet_s
    # 轻微立体声：用左右延时差
    d = int(0.011 * SR)
    R = np.roll(L, d) * 0.985
    R[:d] = 0
    # 收尾淡出 / 开头淡入
    t = np.arange(len(L)) / SR
    fade_in = np.clip(t / 1.2, 0, 1)
    fade_out = np.clip((total + 1.0 - t) / 2.6, 0, 1)
    g = np.minimum(fade_in, fade_out)
    L *= g
    R *= g
    # 母带：软限幅 + 归一
    st = np.stack([L, R], axis=1)
    peak = np.abs(st).max()
    st = st / max(1e-6, peak)
    # 放宽到约 -18 dBFS RMS，峰值压到 -1 dB
    rms = float(np.sqrt((st ** 2).mean()))
    target = 0.125
    st = st * min(6.0, target / max(1e-6, rms))
    st = np.tanh(st * 1.05) / np.tanh(1.05)
    st = st / max(1e-6, np.abs(st).max()) * 0.89
    # 截断到成片长度
    keep = int(total * SR)
    st = st[:keep]
    pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
    path = os.path.join(OUT, f'{tag}.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'[audio] {path}  {len(st)/SR:.2f}s  peak={np.abs(st).max():.3f} rms={np.sqrt((st**2).mean()):.4f}')
    return path


if __name__ == '__main__':
    build_audio(sys.argv[1] if len(sys.argv) > 1 else 'full')
