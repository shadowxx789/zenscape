#!/usr/bin/env python3
"""
verify_engine.py — 网页引擎（OfflineAudioContext 实录）对照定稿 C++6（R8_Cpp6_s64.wav），同一套手机模拟门槛。

用法：python verify_engine.py engine_out/v2_s64.wav [参考 wav]
引擎的随机数与 Python 不同，所以是「同一套规则的另一颗种子」：比的是统计量与门槛，不是逐样本相等。
"""
import json, subprocess, sys
import numpy as np
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_b as rb
import render_r4 as r4

SR = 48000


def lufs(path):
    o = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    I = [l for l in o.splitlines() if l.strip().startswith("I:")][-1].split()[1]
    P = [l for l in o.splitlines() if l.strip().startswith("Peak:")][-1].split()[1]
    return float(I), float(P)


def metrics(wav, ev):
    x = rb.load(wav)
    pm = r4.phone(x).mean(1)
    dur = len(pm) / SR
    bells = ev["bells"]; phrases = ev["phrases"]
    end_bell = bells[-1]
    db = lambda a, b: 10 * np.log10(np.mean(pm[int(a * SR):int(b * SR)] ** 2) + 1e-12)
    out = {}
    out["bell_over"] = [round(db(b, b + 3) - db(b - 5, b - 0.2), 1) for b in bells]
    out["qin_over"] = [round(db(t, t + 1.5) - db(t - 5, t - 0.2), 1) for t in [p["t"] for p in phrases]]
    e = np.array([10 * np.log10(np.mean(pm[i:i + SR] ** 2) + 1e-12) for i in range(0, len(pm) - SR, SR)])[35:330]
    p90 = np.percentile(e, 90); med = np.median(e)
    out["quiet_s"] = int((e <= p90 - 10).sum()); out["deep_s"] = int((e <= p90 - 16).sum())
    out["floor_vs_full"] = round(float(np.percentile(e, 3) - p90), 1)
    out["wall_pct"] = round(float(np.mean(np.abs(e - med) < 3) * 100), 0)
    full = e > p90 - 6; runs, s0 = [], None
    for i, v in enumerate(full):
        if v and s0 is None: s0 = i
        if not v and s0 is not None:
            if i - s0 >= 8: runs.append(float(np.percentile(e[s0:i], 75)))
            s0 = None
    if s0 is not None and len(e) - s0 >= 8: runs.append(float(np.percentile(e[s0:], 75)))
    out["passes"] = [round(r, 1) for r in runs]
    out["pass_spread"] = round(max(runs) - float(np.median(runs)), 1) if len(runs) >= 2 else 0.0
    h = SR // 2
    eh = np.array([10 * np.log10(np.mean(pm[i:i + h] ** 2) + 1e-12) for i in range(0, len(pm) - h, h)])
    # 全混音里的「涌起」：避开钟/琴起音后 4s（那是事件，不是底）
    mask = np.ones(len(eh), bool)
    for t in list(bells) + [a for p in phrases for a in p.get("at", [p["t"]])]:
        mask[max(0, int((t - 2.5) * 2)):int((t + 4) * 2)] = False
    lo, hi = 10, int((end_bell - 1) * 2)
    rises = [eh[i + 4] - eh[i] for i in range(lo, hi - 4) if mask[i:i + 5].all()]
    jumps = [eh[i + 1] - eh[i] for i in range(lo, hi - 1) if mask[i:i + 2].all()]
    out["max_rise_2s"] = round(float(max(rises)), 1); out["max_jump_05s"] = round(float(max(jumps)), 1)
    d = eh[70:660] <= p90 - 16; runs2, s0 = [], None
    for i, v in enumerate(d):
        if v and s0 is None: s0 = i
        if not v and s0 is not None: runs2.append((35 + s0 / 2, (i - s0) / 2)); s0 = None
    out["deep_stretches"] = [(a, l) for a, l in runs2 if l >= 2]

    def dr(t):
        dd = np.mean(pm[int(t * SR):int((t + 0.15) * SR)] ** 2); r = np.mean(pm[int((t + 0.4) * SR):int((t + 2.5) * SR)] ** 2)
        return 10 * np.log10(dd / r)
    out["qin_DR"] = round(float(np.mean([dr(p["t"]) for p in phrases])), 1)
    out["bell_DR"] = round(float(np.mean([dr(b) for b in bells[:-1]])), 1) if len(bells) > 1 else None
    out["tail_last1s"] = round(db(dur - 1, dur), 1)
    out["clicks"] = int((np.abs(np.diff(x.mean(1))) > 0.25).sum())
    env = np.sqrt(np.convolve(pm ** 2, np.ones(2400) / 2400, mode="same"))[::2400][int(35 * 20):int(330 * 20)]
    E = np.abs(np.fft.rfft(env - env.mean())) ** 2; f = np.fft.rfftfreq(len(env), 1 / 20)
    out["jitter_pct"] = round(float(100 * E[(f >= 1) & (f <= 8)].sum() / E[f > 0.01].sum()), 1)
    out["LUFS"], out["peak_dBFS"] = lufs(wav)
    out["dur"] = round(dur, 3)
    return out


GATES = [
    ("bell_over", lambda v: min(v) >= 8.0, "每声钟 ≥ +8dB"),
    ("qin_over", lambda v: min(v) >= 5.0, "每句琴 ≥ +5dB"),
    ("pass_spread", lambda v: v <= 1.0, "最响一阵风 ≤ 中位 +1dB"),
    # 与 render_r8 的 Cpp5/Cpp6 门槛一致：只卡上限（深静会把 p3 拉到 -16 以下，参考版自己就是 -17.7）
    ("floor_vs_full", lambda v: v <= -8.0, "风歇底低于满风 8dB 以上（仍疏）"),
    ("quiet_s", lambda v: v >= 120, "明显安静 ≥ 120s"),
    ("deep_stretches", lambda v: len([1 for _, l in v if 5 <= l <= 8]) >= 1, "至少一段 5–8s 深静"),
    ("tail_last1s", lambda v: v <= -60.0, "结尾最后 1s 静音"),
    ("clicks", lambda v: v == 0, "无爆音"),
]

def bed_gates(bed_wav, end_bell):
    pb = r4.phone(rb.load(bed_wav)).mean(1); h = SR // 2
    eb = np.array([10 * np.log10(np.mean(pb[i:i + h] ** 2) + 1e-12) for i in range(0, len(pb) - h, h)])
    lo, hi = 10, int((end_bell - 1) * 2)
    return (round(float(max(eb[i + 4] - eb[i] for i in range(lo, hi - 4))), 2),
            round(float(max(eb[i + 1] - eb[i] for i in range(lo, hi - 1))), 2))


if __name__ == "__main__":
    wav = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    ref = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "ZenScape_R8_Cpp6_s64.mp3")
    ev = json.load(open(wav.replace(".wav", ".json")))
    ev = {"bells": [b["at"] for b in ev["bells"]], "phrases": [{"t": p["t"], "at": p["at"]} for p in ev["phrases"]]}
    rev = json.load(open(ref.replace(".wav", "_events.json"))) if False else None
    m = metrics(wav, ev)
    # 参考版的事件时间：用 render_r8 打印过的 seed 64 时间线
    ref_ev = {"bells": [150.34, 338.9], "phrases": [{"t": 32.99}, {"t": 168.84}, {"t": 295.92}]}
    r = metrics(ref, ref_ev)
    keys = ["LUFS", "peak_dBFS", "bell_over", "qin_over", "quiet_s", "deep_s", "floor_vs_full", "wall_pct", "passes",
            "pass_spread", "max_rise_2s", "max_jump_05s", "deep_stretches", "qin_DR", "bell_DR", "jitter_pct", "tail_last1s", "clicks", "dur"]
    print(f"{'metric':16s} | engine v2 | reference C++6")
    for k in keys:
        print(f"{k:16s} | {m[k]} | {r[k]}")
    print()
    ok = True
    for k, f, label in GATES:
        p = f(m[k]); ok &= p
        print(("PASS " if p else "FAIL ") + label, "→", m[k])
    import os
    bw = wav.replace(".wav", "_bed.wav")
    if os.path.exists(bw):
        rise, jump = bed_gates(bw, ev["bells"][-1])
        for label, v, lim in (("底层单独 2s 抬升 ≤ 6dB", rise, 6.0), ("底层单独 0.5s 跳动 ≤ 2dB", jump, 2.0)):
            p = v <= lim; ok &= p
            print(("PASS " if p else "FAIL ") + label, "→", v)
    else:
        print("（没有 _bed.wav，底层单独门槛未测）")
    print("ALL PASS" if ok else "SOME FAIL")
    json.dump({"engine": m, "reference": r}, open(wav.replace(".wav", "_verify.json"), "w"), ensure_ascii=False, indent=1, default=float)
