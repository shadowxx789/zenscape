#!/usr/bin/env python3
"""
render_b.py — ZenScape B 版（采样驱动）离线渲染器

思路（照 gen_bgm_guitar 的分层）：
  程序只决定「何时、何处、多大」，声音本身全部来自真实录音。
  - 环境层：风/水 = 长录音里挑出的平稳片段，随机切入 + 长交叉淡化 + 慢速增益漂移，永不整段循环
  - 事件层：钟/古琴 = 真实单音采样，时间点与 A 版实录日志对齐（公平对比）
  - 混音：照现引擎的双总线（ambient / event 各自送混响），整体响度对齐 A 版

用法：python render_b.py --events events.json --out B_samples.wav [--seed 7] [--dur 180]
"""
import argparse, json, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt, fftconvolve

SR = 48000
SRC = "/Users/ew/zenscape/ab-demo/src/"


def load(path, ss=None, t=None, ch=2):
    cmd = ["ffmpeg", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-i", path, "-vn", "-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def filt(x, kind, fc, order=4):
    sos = butter(order, fc, btype=kind, fs=SR, output="sos")
    return sosfiltfilt(sos, x, axis=0).astype(np.float32)


def rms_db(x):
    return 10 * np.log10(np.mean(x ** 2) + 1e-12)


def norm_to(x, db):
    return x * (10 ** ((db - rms_db(x)) / 20))


def eq_fade(n):
    t = np.linspace(0, np.pi / 2, n, dtype=np.float32)
    return np.sin(t), np.cos(t)


def bed(windows, dur, rng, seg=(14, 26), xf=5.0):
    """从多个平稳录音片段随机拼出 dur 秒的连续纹理；等功率交叉淡化，片段不连续重复。"""
    out = np.zeros((int(dur * SR) + SR, 2), np.float32)
    pos, last = 0, -1
    nxf = int(xf * SR)
    fin, fout = eq_fade(nxf)
    while pos < len(out) - nxf:
        i = rng.integers(len(windows))
        if i == last and len(windows) > 1:
            i = (i + 1) % len(windows)
        last = i
        src = windows[i]
        L = int(rng.uniform(*seg) * SR)
        L = min(L, len(src) - 1)
        st = rng.integers(0, max(1, len(src) - L))
        piece = src[st:st + L].copy()
        if rng.random() < 0.5:  # 左右互换，增加不可预测性
            piece = piece[:, ::-1]
        piece[:nxf] *= fin[:, None]
        piece[-nxf:] *= fout[:, None]
        end = min(len(out), pos + L)
        out[pos:end] += piece[:end - pos]
        pos += L - nxf
    return out[:int(dur * SR)]


def drift(n, rng, depth_db=3.0, period=(20, 45)):
    """慢速增益漂移（像风一阵一阵），多个不相关的慢正弦叠加。"""
    t = np.arange(n) / SR
    g = np.zeros(n)
    for _ in range(3):
        g += np.sin(2 * np.pi * t / rng.uniform(*period) + rng.uniform(0, 6.28))
    g = g / 3 * depth_db
    return (10 ** (g / 20)).astype(np.float32)[:, None]


def ir(seconds, rt60, rng, lp=6000):
    """混响 IR（指数衰减噪声，与现引擎卷积总线同一思路），只用于空间感，不作为声源。"""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.91 * t / rt60)
    x = rng.standard_normal((n, 2)).astype(np.float32) * env[:, None]
    x = filt(x, "lowpass", lp, 2)
    x[: int(0.012 * SR)] = 0  # 预延迟
    return x / np.sqrt(np.sum(x ** 2))


def place(buf, sample, t, gain, pan):
    i = int(t * SR)
    if i >= len(buf):
        return
    s = sample * gain
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    mono = s.mean(1)
    st = np.stack([mono * l * 1.414, mono * r * 1.414], 1)
    end = min(len(buf), i + len(st))
    buf[i:end] += st[: end - i]


def slice_note(x, on, off, pre=0.015, fade_out=0.35):
    a = max(0, int((on - pre) * SR))
    b = min(len(x), int(off * SR))
    s = x[a:b].copy()
    nfi = int(0.004 * SR)
    s[:nfi] *= np.linspace(0, 1, nfi, dtype=np.float32)[:, None]
    nfo = min(len(s) // 2, int(fade_out * SR))
    s[-nfo:] *= np.linspace(1, 0, nfo, dtype=np.float32)[:, None] ** 2
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True, help="A 版实录的事件日志 JSON：[[t_sec, type, volume, pan], ...]")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dur", type=float, default=180.0)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    n = int(a.dur * SR)

    # ---------- 风：wind_field 里最平稳的几段（阵风过强的窗剔除），去低频风噪/麦克风隆隆，压掉高频嘶声
    wf = SRC + "wind_field.mp3"
    wind_w = [load(wf, s, 15) for s in (720, 225, 165, 510, 180, 240, 435, 135)]
    wind_w = [filt(filt(w, "highpass", 140), "lowpass", 2800) for w in wind_w]
    wind = bed(wind_w, a.dur, rng) * drift(n, rng, 3.5)

    # ---------- 水：Forest lawn creek（公有领域实录）中稳定段，避开 195s 嘶声尖峰与 330s 后的空段
    wc = SRC + "water_creek_pd.ogg"
    water_w = [load(wc, s, 30) for s in (60, 90, 120, 150, 240, 270, 290)]
    water_w = [filt(filt(w, "highpass", 180), "lowpass", 5500) for w in water_w]
    water = bed(water_w, a.dur, rng, seg=(18, 30), xf=6.0) * drift(n, rng, 2.0, (30, 60))

    # 静坐模式比例：现预设 windGain 0.26 / waterGain 0.18 → 风略大于水；整体压低，留白
    wind = norm_to(wind, -34.0)
    water = norm_to(water, -37.0)
    ambient = wind * 0.8 + water * 0.6  # 轻微左右错位
    ambient[:, 0] = wind[:, 0] * 0.85 + water[:, 0] * 0.55
    ambient[:, 1] = wind[:, 1] * 0.75 + water[:, 1] * 0.65

    # ---------- 事件采样
    bell_src = load(SRC + "bell_okadera.webm")
    bell = slice_note(bell_src, 3.91, 10.7, fade_out=1.2)
    bell = filt(bell, "highpass", 70)
    qr = load(SRC + "guqin_ruibin.ogg")
    qm = load(SRC + "guqin_manshang.ogg")
    r_on = [0.34, 1.49, 2.57, 3.68, 4.79, 5.90, 7.05]
    m_on = [0.37, 1.38, 2.25, 3.17, 4.11, 5.03]
    notes = []
    for src, ons in ((qr, r_on), (qm, m_on)):
        for k, o in enumerate(ons):
            off = ons[k + 1] + 0.25 if k + 1 < len(ons) else min(len(src) / SR, o + 4.5)
            notes.append(slice_note(src, o, off, fade_out=0.5 if k + 1 < len(ons) else 1.5))
    long_notes = [notes[6], notes[12]]  # 两条带完整余韵的尾音
    short_notes = [x for i, x in enumerate(notes) if i not in (6, 12)]

    events = json.load(open(a.events))
    ev_bus = np.zeros((n + SR * 8, 2), np.float32)
    for t, typ, vol, pan in events:
        if t >= a.dur:
            continue
        v = 0.25 + 0.75 * float(vol)  # A 版音量 0.06–0.18×instrumentLevel，这里只保留相对强弱
        if typ == "temple_bell":
            place(ev_bus, bell, t, 0.55 * v, float(pan))
        else:
            first = long_notes[rng.integers(2)] if rng.random() < 0.6 else short_notes[rng.integers(len(short_notes))]
            place(ev_bus, first, t, 0.45 * v, float(pan))
            # 偶尔接一个泛音/第二音，与 OneShotPlayer 的 HARMONIC_OVERTONE_PROB 同构
            if rng.random() < 0.35:
                dt = rng.uniform(1.3, 2.8)
                place(ev_bus, short_notes[rng.integers(len(short_notes))], t + dt, 0.22 * v, float(pan) * 0.8)
    ev_bus = ev_bus[:n]

    # ---------- 双总线混响（湿声比例沿用静坐预设 reverbWet≈0.45 的意图，环境层更少）
    amb_ir = ir(3.0, 2.2, rng, 5000)
    ev_ir = ir(7.0, 5.5, rng, 4500)
    amb_wet = fftconvolve(ambient, amb_ir, axes=0)[:n]
    ev_wet = fftconvolve(ev_bus, ev_ir, axes=0)[:n]
    mix = ambient + 0.18 * amb_wet + ev_bus * 0.9 + 0.55 * ev_wet

    # 3 秒淡入，与现引擎 FADE_DURATION 一致；尾部 3 秒淡出
    fi = int(3 * SR)
    mix[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    mix[-fi:] *= np.linspace(1, 0, fi, dtype=np.float32)[:, None]

    peak = np.max(np.abs(mix))
    if peak > 0.89:
        mix *= 0.89 / peak
    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
    import wave
    with wave.open(a.out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(json.dumps({"out": a.out, "dur": len(pcm) / SR, "peak_dbfs": float(round(20 * np.log10(np.max(np.abs(mix)) + 1e-9), 2)),
                      "rms_db": float(round(rms_db(mix), 2)), "events_used": sum(1 for e in events if e[0] < a.dur)}))


if __name__ == "__main__":
    main()
