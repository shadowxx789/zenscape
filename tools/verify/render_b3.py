#!/usr/bin/env python3
"""
render_b3.py — 第三轮。针对 Eric 对 B2 的三条反馈：

1. 「第三个感觉就是风声」：B2 里钟只比底高 5dB、古琴只高 0.4dB，事件被风盖住了；
   水被我低通到和风同频（频谱相关 0.86–0.90），水也融进了风里。
   → 事件按实测响度放置（钟高出底 ≥10dB、琴 ≥7dB），出片前跑门槛检查，不达标就报错。
   → 水不再低通。安静的水靠「选更小的水」，不靠滤波。
2. 「水声加风声」：B2 的水试听里没有风，听到风＝我的水处理把水做成了风。
   → 改用三条 CC0 小涓流实录，原样（只做响度对齐与淡入淡出）。
3. 「钟声也不太对」：降调重采样 + 合成混响 = 不真实。
   → 换两口本来就大、本来就低的真钟（不降调）；各给「原样」与「轻推远」两版。

产出：audition_bell3.wav / audition_water3.wav / B3_samples.wav
"""
import json, sys, wave
import numpy as np
from scipy.signal import fftconvolve
sys.path.insert(0, "/Users/ew/zenscape/ab-demo")
import render_b as rb

SR = rb.SR
FS = rb.SRC + "fs/"
D = "/Users/ew/zenscape/ab-demo/"


def write(path, x):
    peak = np.max(np.abs(x))
    if peak > 0.89:
        x = x * (0.89 / peak)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def cut(x, a, b, fin=0.01, fout=4.0):
    s = x[int(a * SR):int(b * SR)].copy()
    i = int(fin * SR); o = min(len(s) // 2, int(fout * SR))
    s[:i] *= np.linspace(0, 1, i, dtype=np.float32)[:, None]
    s[-o:] *= (np.linspace(1, 0, o, dtype=np.float32) ** 1.5)[:, None]
    return s


def head_db(s, sec=3.0):
    return rb.rms_db(s[: int(sec * SR)])


def set_head(s, db, sec=3.0):
    return s * (10 ** ((db - head_db(s, sec)) / 20))


def far(x, seed=3):
    """轻推远：只做三件事，不降调——高频略收、直达声略降、加一点空间。"""
    r = np.random.default_rng(seed)
    y = rb.filt(x, "lowpass", 2500, 2)
    n = len(y) + int(5 * SR)
    out = np.zeros((n, 2), np.float32)
    out[: len(y)] += y * 0.7
    w = fftconvolve(y, rb.ir(4.5, 3.8, r, lp=2200), axes=0)
    pd = int(0.06 * SR)
    out[pd: pd + len(w)] += w[: n - pd] * 0.45
    return out


# ---------------------------------------------------------------- 钟（不降调）
def zojoji():
    """增上寺大钟（东京）。freesound 843521，CC BY 4.0。基频约 88Hz，带明显『嗡—嗡—』拍音。"""
    x = rb.load(FS + "843521.mp3")
    return cut(x, 0.40, 13.0)


def hiroshima():
    """广岛和平钟（最大的一口）。freesound 259997，CC BY 3.0。基频约 55Hz 嗡音 + 177Hz 撞击音。"""
    x = rb.load(FS + "259997.mp3")
    return cut(x, 4.00, 16.8)


BELLS = {
    "1_增上寺钟_原样": lambda: zojoji(),
    "2_增上寺钟_轻推远": lambda: far(zojoji()),
    "3_广岛和平钟_原样": lambda: hiroshima(),
    "4_广岛和平钟_轻推远": lambda: far(hiroshima()),
}

# ---------------------------------------------------------------- 水（不滤波）
WATERS = {
    "1_苏格兰小溪_Aviemore": ("415151.mp3", "CC0"),
    "2_澳洲涓流_Springbrook": ("349076.mp3", "CC0"),
    "3_林间小水沟_burn": ("363120.mp3", "CC0"),
}


def water_src(key):
    return rb.load(FS + WATERS[key][0])


# ---------------------------------------------------------------- 试听
def audition_bell(path):
    gap = 22.0
    out = np.zeros((int((2 + gap * len(BELLS)) * SR), 2), np.float32)
    for k, (name, fn) in enumerate(BELLS.items()):
        s = set_head(fn(), -22.0)  # 敲击后 3 秒同响度，远的不因为小声吃亏
        i = int((2 + k * gap) * SR); e = min(len(out), i + len(s))
        out[i:e] += s[: e - i]
    write(path, out)


def audition_water(path):
    parts = []
    for key in WATERS:
        s = water_src(key)[: int(25 * SR)]
        s = rb.norm_to(s, -30.0)
        f = int(1.5 * SR)
        s[:f] *= np.linspace(0, 1, f, dtype=np.float32)[:, None]
        s[-f:] *= np.linspace(1, 0, f, dtype=np.float32)[:, None]
        parts += [s, np.zeros((2 * SR, 2), np.float32)]
    write(path, np.concatenate(parts))


# ---------------------------------------------------------------- 完整 B3
def guqin_notes():
    qr = rb.load(rb.SRC + "guqin_ruibin.ogg"); qm = rb.load(rb.SRC + "guqin_manshang.ogg")
    r_on = [0.34, 1.49, 2.57, 3.68, 4.79, 5.90, 7.05]; m_on = [0.37, 1.38, 2.25, 3.17, 4.11, 5.03]
    notes = []
    for src, ons in ((qr, r_on), (qm, m_on)):
        for k, o in enumerate(ons):
            off = ons[k + 1] + 0.25 if k + 1 < len(ons) else min(len(src) / SR, o + 4.5)
            notes.append(rb.slice_note(src, o, off, fade_out=0.5 if k + 1 < len(ons) else 1.5))
    return [notes[6], notes[12]], [x for i, x in enumerate(notes) if i not in (6, 12)]


def full(path, events, bell_name, water_key, dur=180.0, bell_over=12.0, qin_over=8.0):
    r = np.random.default_rng(7); n = int(dur * SR)
    wf = rb.SRC + "wind_field.mp3"
    wind_w = [rb.filt(rb.filt(rb.load(wf, s, 15), "highpass", 140), "lowpass", 2800)
              for s in (720, 225, 165, 510, 180, 240, 435, 135)]
    wind = rb.norm_to(rb.bed(wind_w, dur, r) * rb.drift(n, r, 3.5), -36.0)
    ws = water_src(water_key)
    water_w = [ws[int(a * SR): int((a + 9) * SR)] for a in np.arange(0, len(ws) / SR - 9, 3.0)]
    water = rb.norm_to(rb.bed(water_w, dur, r, seg=(7, 9), xf=2.5), -41.0)
    amb = wind + water
    amb = amb + 0.15 * fftconvolve(amb, rb.ir(2.5, 1.8, r, 4000), axes=0)[:n]
    bed_db = rb.rms_db(amb)

    long_n, short_n = guqin_notes()
    bell = set_head(BELLS[bell_name](), bed_db + bell_over)
    ev = np.zeros((n + 30 * SR, 2), np.float32)
    rr = np.random.default_rng(7)
    for t, typ, vol, pan in events:
        if t >= dur:
            continue
        if typ == "temple_bell":
            i = int(t * SR); e = min(len(ev), i + len(bell)); ev[i:e] += bell[: e - i]
        else:
            note = long_n[rr.integers(2)]
            note = set_head(note, bed_db + qin_over, sec=1.0)
            q = np.zeros((len(note) + 8 * SR, 2), np.float32); q[: len(note)] = note
            wq = fftconvolve(note, rb.ir(5.0, 3.5, rr, 4500), axes=0)[: len(q)]
            q[: len(wq)] += 0.35 * wq
            rb.place(ev, q, t, 1.0, float(pan))
            if rr.random() < 0.35:
                n2 = set_head(short_n[rr.integers(len(short_n))], bed_db + qin_over - 6, sec=0.5)
                rb.place(ev, n2, t + rr.uniform(1.3, 2.8), 1.0, float(pan) * 0.8)
    mix = amb + ev[:n]
    fi = 3 * SR
    mix[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    mix[-fi:] *= np.linspace(1, 0, fi, dtype=np.float32)[:, None]
    write(path, mix)

    # ---- 门槛：事件必须听得见，水必须和风分得开
    m = mix.mean(1)
    db = lambda a, b: 10 * np.log10(np.mean(m[int(a * SR):int(b * SR)] ** 2) + 1e-12)
    gates = []
    for t, typ, *_ in events:
        if t + 4 < dur:
            d = db(t, t + 3) - db(t - 5, t - 0.2)
            need = 8.0 if typ == "temple_bell" else 5.0
            gates.append((typ, round(t, 1), round(d, 1), d >= need))
    Sw = np.abs(np.fft.rfft(wind[: 30 * SR].mean(1))) ** 2; Sa = np.abs(np.fft.rfft(amb[: 30 * SR].mean(1))) ** 2
    f = np.fft.rfftfreq(30 * SR, 1 / SR); band = (f > 1500) & (f < 5000)
    water_lift = 10 * np.log10(Sa[band].sum() / Sw[band].sum())
    gates.append(("water_vs_wind_1.5-5k_lift_dB", None, round(float(water_lift), 1), water_lift >= 3.0))
    return gates


if __name__ == "__main__":
    audition_bell(D + "audition_bell3.wav")
    audition_water(D + "audition_water3.wav")
    ev = json.load(open(D + "events_A.json"))
    g = full(D + "B3_samples.wav", ev, "2_增上寺钟_轻推远", "1_苏格兰小溪_Aviemore")
    for row in g:
        print("GATE", row)
    if not all(r[-1] for r in g):
        sys.exit("gate failed")
    print("ok")
