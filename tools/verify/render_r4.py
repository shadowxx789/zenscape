#!/usr/bin/env python3
"""
render_r4.py — 第四轮。按 grill-me 两轮定下的目标：

  底：竹叶沙沙 + 很轻的风 + 竹林里的小山涧（缓），要「被忘掉」
  事：钟 ≈ 每 3 分钟一次，厚重、远；古琴 40–90 秒一次，零散单音，空灵
  空间：大，余音长 → 空灵
  判断标准：手机外放。所有响度对齐、所有门槛都在「手机模拟」（HP300/LP9k）之后测

产出：
  audition_bell4.wav  4 口钟，同一套大空间处理，手机模拟下敲击后 3 秒同响度
  audition_wind4.wav  0=上一版风 1=竹叶沙沙 2=很轻的风 3=两者合成（提议的底）
  R4_full.wav         6 分钟完整：两次钟（约 1:05、4:05），古琴 40–90 秒一次
"""
import json, sys, wave
import numpy as np
from scipy.signal import fftconvolve
sys.path.insert(0, "/Users/ew/zenscape/ab-demo")
import render_b as rb
import render_b3 as r3

SR = rb.SR
FS = rb.SRC + "fs/"
D = "/Users/ew/zenscape/ab-demo/"


def phone(x):
    return rb.filt(rb.filt(x, "highpass", 300, 4), "lowpass", 9000, 2)


def pdb(x):
    """手机模拟后的 RMS dB。"""
    return rb.rms_db(phone(x))


def set_phone_head(s, db, sec=3.0):
    return s * (10 ** ((db - pdb(s[: int(sec * SR)])) / 20))


def onset_after(x, t_from, rise=20.0):
    m = x.mean(1)
    e = 20 * np.log10(np.sqrt(np.convolve(m ** 2, np.ones(480) / 480, mode="same"))[::480] + 1e-9)
    i0 = int(t_from * 100)
    floor = np.median(e[max(0, i0 - 100):i0 + 1]) if i0 > 0 else np.min(e[:50])
    hit = np.where(e[i0:] > floor + rise)[0]
    return (i0 + hit[0]) / 100 if len(hit) else t_from


# ---------------------------------------------------------------- 大空间
def space(x, rt60=6.0, wet=0.55, dry=0.75, predelay=0.07, lp=3800, seed=1):
    """大空间：几次早期反射 + 长混响尾。混响去掉 250Hz 以下（手机放不出，只会糊）。"""
    r = np.random.default_rng(seed)
    n = len(x) + int((rt60 + 1.5) * SR)
    out = np.zeros((n, 2), np.float32)
    out[: len(x)] += x * dry
    for dt, g, flip in ((0.031, 0.22, False), (0.053, 0.17, True), (0.089, 0.13, False), (0.137, 0.10, True)):
        i = int(dt * SR); y = x[:, ::-1] if flip else x
        out[i:i + len(x)] += rb.filt(y, "lowpass", lp, 2) * g
    tail = fftconvolve(x, rb.ir(rt60 + 1.0, rt60, r, lp=lp), axes=0)
    tail = rb.filt(tail, "highpass", 250, 2)
    pd = int(predelay * SR)
    m = min(len(tail), n - pd)
    out[pd:pd + m] += tail[:m] * wet
    return out


# ---------------------------------------------------------------- 钟（都不降调）
def bell_byodo():
    """平等院钟（夏威夷 Byodo-In，五英尺高三吨铜钟）。Freesound 516051，CC BY 4.0。"""
    x = rb.load(FS + "516051.mp3"); t = onset_after(x, 9.0)
    return r3.cut(x, t - 0.02, t + 42.0, fout=8.0)


def bell_hida():
    """飞驒之里山寺梵钟（高山）。Freesound 397352，CC0。有明显『嗡—嗡』拍音。"""
    x = rb.load(FS + "397352.mp3"); t = onset_after(x, 0.0)
    return r3.cut(x, t - 0.02, 10.0, fout=3.5)


def bell_komori():
    """Taira Komori『Budda large bell』。Freesound 212057，CC BY 4.0。中频分音强，手机友好。"""
    x = rb.load(FS + "212057.mp3"); t = onset_after(x, 0.0)
    return r3.cut(x, t - 0.02, 19.8, fout=4.0)


def bell_zojoji():
    """上一版参考：增上寺钟（Freesound 843521，CC BY 4.0）。"""
    return r3.zojoji()


BELLS = {
    "0_上一版参考_增上寺": bell_zojoji,
    "1_平等院三吨钟": bell_byodo,
    "2_飞驒山寺梵钟": bell_hida,
    "3_大佛钟": bell_komori,
}


def bell_far(s):
    """远：轻空气吸收 + 大空间。不降调。"""
    return space(rb.filt(s, "lowpass", 3200, 2), rt60=7.0, wet=0.65, dry=0.6, predelay=0.09, lp=3000, seed=4)


# ---------------------------------------------------------------- 风
BAMBOO_WIN = (65, 165, 90, 100, 170, 140, 60, 160)   # Freesound 72559 实测最安静且无竹竿碰撞瞬态的 10s 窗


def bamboo(dur, rng):
    src = FS + "72559.mp3"
    ws = [rb.filt(rb.load(src, s, 10), "highpass", 250, 2) for s in BAMBOO_WIN]
    return rb.bed(ws, dur, rng, seg=(7, 9.5), xf=2.5)


def breeze(dur, rng):
    src = FS + "460178.mp3"  # 瑞典森林平稳微风，CC0；标签含 distant highway → 高通 200Hz 去掉远处车流的低频
    ws = [rb.filt(rb.load(src, s, 20), "highpass", 200, 4) for s in (0, 20, 40, 60, 80)]
    return rb.bed(ws, dur, rng, seg=(15, 19), xf=4.0)


def old_wind(dur, rng):
    wf = rb.SRC + "wind_field.mp3"
    ws = [rb.filt(rb.filt(rb.load(wf, s, 15), "highpass", 140), "lowpass", 2800) for s in (720, 225, 165, 510)]
    return rb.bed(ws, dur, rng)


def proposed_bed_wind(dur, rng, n):
    b = bamboo(dur, rng); z = breeze(dur, rng)
    b = b * rb.drift(n, rng, 3.0, (18, 40))          # 竹叶随风一阵一阵
    return b * (10 ** ((-40 - pdb(b)) / 20)) + z * (10 ** ((-46 - pdb(z)) / 20))


# ---------------------------------------------------------------- 试听
def audition_bell(path):
    gap = 30.0
    out = np.zeros((int((2 + gap * len(BELLS) + 6) * SR), 2), np.float32)
    for k, fn in enumerate(BELLS.values()):
        s = set_phone_head(bell_far(fn()), -22.0)
        i = int((2 + k * gap) * SR); e = min(len(out), i + len(s))
        out[i:e] += s[: e - i]
    r3.write(path, out)


def audition_wind(path):
    seg = 25.0; n = int(seg * SR); parts = []
    makers = [lambda r: old_wind(seg, r), lambda r: bamboo(seg, r), lambda r: breeze(seg, r),
              lambda r: proposed_bed_wind(seg, r, n)]
    for mk in makers:
        s = mk(np.random.default_rng(3))[:n]
        s = space(s, rt60=2.6, wet=0.25, dry=0.9, lp=5000, seed=2)[:n]
        s = s * (10 ** ((-32 - pdb(s)) / 20))
        f = int(1.5 * SR)
        s[:f] *= np.linspace(0, 1, f, dtype=np.float32)[:, None]; s[-f:] *= np.linspace(1, 0, f, dtype=np.float32)[:, None]
        parts += [s, np.zeros((2 * SR, 2), np.float32)]
    r3.write(path, np.concatenate(parts))


# ---------------------------------------------------------------- 完整 6 分钟
def schedule(dur, rng):
    """钟约每 3 分钟（±10s）；古琴间隔严格 40–90s，碰到钟前后 18s 就往后挪，不跳过。"""
    bells = [65.0 + rng.uniform(-10, 10), 245.0 + rng.uniform(-10, 10)]
    qin, t = [], 20.0
    while t < dur - 15:
        for b in bells:
            if abs(t - b) <= 18:
                t = b + 18.5
        if qin and t - qin[-1] > 90:
            t = qin[-1] + 90
            for b in bells:
                if abs(t - b) <= 18:
                    t = b - 18.5
        if t < dur - 15:
            qin.append(round(t, 2))
        t += rng.uniform(40, 90)
    return [round(b, 2) for b in bells], qin


WATER_DB = -39.0


def full(path, bell_name="1_平等院三吨钟", dur=360.0, seed=7):
    rng = np.random.default_rng(seed); n = int(dur * SR)
    wind = proposed_bed_wind(dur, rng, n)
    ws = r3.water_src("1_苏格兰小溪_Aviemore")
    ww = [ws[int(a * SR): int((a + 9) * SR)] for a in np.arange(0, len(ws) / SR - 9, 3.0)]
    water = rb.bed(ww, dur, rng, seg=(7, 9), xf=2.5)
    water = water * (10 ** ((WATER_DB - pdb(water)) / 20))
    bed = space(wind + water, rt60=2.6, wet=0.25, dry=0.9, lp=5000, seed=2)[:n]
    bed_p = pdb(bed)

    bells, qin = schedule(dur, rng)
    ev = np.zeros((n + 60 * SR, 2), np.float32)
    bell = set_phone_head(bell_far(BELLS[bell_name]()), bed_p + 14.0)
    for t in bells:
        i = int(t * SR); e = min(len(ev), i + len(bell)); ev[i:e] += bell[: e - i]
    long_n, short_n = r3.guqin_notes()
    for t in qin:
        note = long_n[rng.integers(2)] if rng.random() < 0.6 else short_n[rng.integers(len(short_n))]
        q = space(note, rt60=5.5, wet=0.6, dry=0.8, predelay=0.05, lp=4200, seed=int(rng.integers(1000000)))
        q = set_phone_head(q, bed_p + 10.0, sec=1.0)
        rb.place(ev, q, t, 1.0, float(rng.uniform(-0.35, 0.35)))
        if rng.random() < 0.4:  # 偶尔一个泛音式的第二声
            n2 = space(short_n[rng.integers(len(short_n))], rt60=5.5, wet=0.7, dry=0.6, lp=4200, seed=9)
            n2 = set_phone_head(n2, bed_p + 4.0, sec=0.5)
            rb.place(ev, n2, t + rng.uniform(1.6, 3.2), 1.0, float(rng.uniform(-0.5, 0.5)))
    mix = bed + ev[:n]
    fi = 4 * SR
    mix[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    mix[-fi:] *= np.linspace(1, 0, fi, dtype=np.float32)[:, None]
    r3.write(path, mix)

    # ---- 门槛：全部在手机模拟后测
    pm = phone(mix).mean(1)
    db = lambda a, b: 10 * np.log10(np.mean(pm[int(a * SR):int(b * SR)] ** 2) + 1e-12)
    gates = [("bell", t, round(db(t, t + 3) - db(t - 5, t - 0.2), 1), 8.0) for t in bells]
    gates += [("qin", t, round(db(t, t + 1.5) - db(t - 5, t - 0.2), 1), 5.0) for t in qin]
    # 水在手机上必须和风分得开：1.5–5k 加入水后抬升 ≥3dB
    pw, pa = phone(wind[: 30 * SR]).mean(1), phone((wind + water)[: 30 * SR]).mean(1)
    f = np.fft.rfftfreq(len(pw), 1 / SR); band = (f > 1500) & (f < 5000)
    lift = 10 * np.log10((np.abs(np.fft.rfft(pa)) ** 2)[band].sum() / (np.abs(np.fft.rfft(pw)) ** 2)[band].sum())
    gates.append(("water_lift", None, round(float(lift), 1), 3.0))
    gaps = [b - a for a, b in zip(qin, qin[1:])]
    gates.append(("qin_gap_max<=90", None, round(90 - max(gaps), 1), 0.0))
    gates.append(("qin_gap_min>=36", None, round(min(gaps) - 36, 1), 0.0))
    d = np.abs(np.diff(mix.mean(1))); clicks = int((d > 0.25).sum())
    gates.append(("clicks(>0.25 step)", None, clicks, None))
    return bells, qin, gates


if __name__ == "__main__":
    audition_bell(D + "audition_bell4.wav")
    audition_wind(D + "audition_wind4.wav")
    bells, qin, gates = full(D + "R4_full.wav")
    print("bells at", bells); print("qin at", qin)
    ok = True
    for name, t, v, need in gates:
        passed = (v == 0) if need is None else (v >= need)
        ok &= passed
        print("GATE", name, t, v, "need", need, "PASS" if passed else "FAIL")
    json.dump({"bells": bells, "qin": qin}, open(D + "R4_events.json", "w"))
    sys.exit(0 if ok else 3)
