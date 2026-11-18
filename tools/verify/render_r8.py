#!/usr/bin/env python3
"""
render_r8.py — Eric 对 C 版：「风停水退都要更多；只有稀疏才能静；太密了停不下来、急躁、快节奏」。

C（参考）：风歇 6–14s / 风满 25–60s / 渐变 3–5s / 风退 -13dB、水退约 -8dB
C+ 退得更多：风歇 15–30s / 风满 20–40s / 渐变 5–8s（更慢的呼吸）/ 风 -20dB、水 -16dB
C++ 静为常态：倒过来——底层大部分时间是静的，风是偶尔「路过」的
      静 35–80s / 风过 12–25s / 渐变 6–10s / 风 -22dB、水 -18dB
古琴三版都同 C：乐句 70–140s，多为单音。钟同前（约 3 分钟一次，结尾一声收）。
"""
import sys
import numpy as np
sys.path.insert(0, "/Users/ew/zenscape/ab-demo")
import render_r6 as r6
import render_r4 as r4
import render_b as rb

QIN_W = {"入": [.8, .2, 0], "定": [.5, .5, 0], "深": [.7, .3, 0], "归": [1, 0, 0]}
V = {
    "C":   dict(depth=-13.0, lull=(6, 14),  ramp=(3, 5),  gap=(25, 60), first=(30, 50), water_exp=0.6, min_quiet=30),
    "Cp":  dict(depth=-20.0, lull=(15, 30), ramp=(5, 8),  gap=(20, 40), first=(28, 40), water_exp=0.8, min_quiet=110),
    "Cpp": dict(depth=-22.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.8, min_quiet=170),
    # Eric 选 C++；「停下来再起来时突然涌起来」→ 风回来更慢（下行 6–10s，上行 ×2.5 = 15–25s（smootherstep 在 dB 域最陡 1.875×22/15≈2.75dB/s，满足 2s≤6dB）），smootherstep
    "Cpp2": dict(depth=-22.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.8, up_mult=2.5, min_quiet=170),
    # Eric：倒数 1:22（4:38 起那阵风）比别处响 → 每阵风回来的顶随机低 0–3dB，前面静得越久回来越轻
    "Cpp3": dict(depth=-22.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.8, up_mult=2.5, level=True, min_quiet=170),
    # Eric：C++3 风歇「一点声音都没有，太安静反而不对」→ 歇里留隐约的风和水：
    # 风只退 -15dB（原 -22），水只退 -8dB 并保底，歇里风有 ±3dB、周期 12–28s 的慢余息
    "Cpp4": dict(depth=-15.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.55, water_floor=-8.0, murmur=3.0, up_mult=2.5, level=True, min_quiet=120),
    # Eric：深静还是要留一些 5–7s → 风歇里按 75% 概率挖一个深静小窝（风＋水再退 9dB，保持 4.5–6s，加上下坡约 5–7s 落在 -16dB 以下）
    "Cpp5": dict(depth=-15.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.55, water_floor=-8.0, murmur=3.0, up_mult=2.5, level=True, pockets=dict(depth=-9.0, hold=(2.8, 3.6), dn=(2.0, 2.5), up=(6.0, 7.0), prob=0.85), min_quiet=120),
    # Eric：C++5 差不多了；古琴太近、太亮 → 推远；钟再远一点点
    "Cpp6": dict(depth=-15.0, lull=(35, 80), ramp=(6, 10), gap=(12, 25), first=(26, 36), water_exp=0.55, water_floor=-8.0, murmur=3.0, up_mult=2.5, level=True, pockets=dict(depth=-9.0, hold=(2.8, 3.6), dn=(2.0, 2.5), up=(6.0, 7.0), prob=0.85), min_quiet=120),
}
name = sys.argv[1]; seed = int(sys.argv[2]) if len(sys.argv) > 2 else 78
cfg = dict(V[name]); min_quiet = cfg.pop("min_quiet")
r6.BREATH = cfg; r6.BED_BREATH = True
if name == "Cpp6":
    # 古琴：直达声先过空气（LP 2.2–2.8k），干声 0.75→0.4、湿声 0.7→0.85、预延迟 50→90ms、尾巴更长更暗
    r6.QIN_FAR = dict(air_lp=(2200, 2800), rt60=(6.5, 8.0), wet=0.85, dry=0.4, predelay=0.09, lp=3000, head=10.0)
    # 钟：再远一点点——LP 2.6–3.6k→2.1–2.8k、干 0.6→0.45、湿 0.65→0.75、预延迟 90→120ms、略轻 1dB
    r6.BELL_FAR = dict(lp=(2100, 2800), rt60=(7.0, 8.0), wet=0.75, dry=0.45, predelay=0.12, rlp=2600, head=-1.0)
r6.QIN_GAP = (70.0, 140.0); r6.NOTE_W = QIN_W; r6.MOTIF_MIN = 1; r6.LOCAL_COMP = True
r4.WATER_DB = -39.0 - 3.0
out = f"R8_{name}_s{seed}.wav"
bells, phrases, gates = r6.render(seed, 360.0, r6.D + out)
print(name, "seed", seed, "bells", bells)
for p in phrases:
    print(f"  {p['t']:7.2f}s [{p['phase']}] {p['kind']:3s} {' → '.join(p['notes'])}")
fails = [g for g in gates if g[2] < g[3] and not (name.startswith("Cpp") and g[0].startswith("motif"))]
for g in gates:
    if g[0].startswith("bed_max"):
        print("BEDGATE", g)

SR = r6.SR
x = rb.load(r6.D + out); pm = r4.phone(x).mean(1)
e = np.array([10 * np.log10(np.mean(pm[i:i + SR] ** 2) + 1e-12) for i in range(0, len(pm) - SR, SR)])[35:330]
ref = np.percentile(e, 90)                     # 以「风满时」为参照，不受安静时长影响
quiet = int((e <= ref - 10).sum()); deep = int((e <= ref - 16).sum())
# 急躁感：底层 50ms 包络在 1–8Hz 的起伏能量占比（快速抖动＝急）
env = np.sqrt(np.convolve(pm ** 2, np.ones(2400) / 2400, mode="same"))[::2400][int(35 * 20):int(330 * 20)]
E = np.abs(np.fft.rfft(env - env.mean())) ** 2; f = np.fft.rfftfreq(len(env), 1 / 20)
jitter = 100 * E[(f >= 1) & (f <= 8)].sum() / E[f > 0.01].sum()
# 起伏次数：每分钟穿越中位线几次（越少越慢）
sm = np.convolve(e, np.ones(5) / 5, mode="same"); med = np.median(sm)
cross = int(np.sum(np.diff(np.sign(sm - med)) != 0)) / (len(sm) / 60)
# 风过之间的一致性：每阵风满段（> p60）的 p75，最响一阵比其余中位高多少
full = e > np.percentile(e, 90) - 6; runs, s0 = [], None   # 风满段＝离风满 6dB 以内（风歇里的余息不再被误算成一阵风）
for i, v in enumerate(full):
    if v and s0 is None: s0 = i
    if not v and s0 is not None:
        if i - s0 >= 8: runs.append(float(np.percentile(e[s0:i], 75)))
        s0 = None
if s0 is not None and len(e) - s0 >= 8: runs.append(float(np.percentile(e[s0:], 75)))
spread = (max(runs) - np.median(runs)) if len(runs) >= 2 else 0.0
print("PASSES p75 dB:", [round(r, 1) for r in runs], f"loudest-over-median {spread:.1f}dB")
if name.startswith("Cpp") and name not in ("Cpp", "Cpp2") and spread > 1.0:
    fails.append(("loudest_pass_over_median<=1dB", None, round(spread, 1), 1.0))
p90 = np.percentile(e, 90); floor = float(np.percentile(e, 3))
print(f"FLOOR p3 {floor:.1f}dB = windfull{floor - p90:+.1f}dB  (C++3 was about -18 to -20)")
if name in ("Cpp5", "Cpp6"):
    h = SR // 2
    eh = np.array([10 * np.log10(np.mean(pm[i:i + h] ** 2) + 1e-12) for i in range(0, len(pm) - h, h)])[70:660]
    dmask = eh <= p90 - 16; runs2, s0 = [], None
    for i, v in enumerate(dmask):
        if v and s0 is None: s0 = i
        if not v and s0 is not None: runs2.append((s0, i - s0)); s0 = None
    runs2 = [(35 + a / 2, l / 2) for a, l in runs2 if l >= 4]
    print("POCKETS planned (t,hold):", r6.LAST_POCKETS, " measured deep stretches (start s, len s):", runs2)
    lens = [l for _, l in runs2]
    if len(lens) < 2:
        fails.append(("deep_pockets>=2", None, len(lens), 2))
    if any(l < 5 or l > 7 for l in lens):
        fails.append(("deep_pocket_len_5-7s", None, lens, "5-7"))
if name in ("Cpp4", "Cpp5", "Cpp6"):
    if name == "Cpp4" and floor - p90 < -16.0:
        fails.append(("lull_floor>=windfull-16dB", None, round(floor - p90, 1), -16.0))
    if floor - p90 > -8.0:
        fails.append(("lull_floor<=windfull-8dB(still sparse)", None, round(floor - p90, 1), -8.0))
def dist(t):
    a = pm[int(t * SR):int((t + 1.5) * SR)]; S = np.abs(np.fft.rfft(a)) ** 2; f = np.fft.rfftfreq(len(a), 1 / SR)
    m = (f > 150) & (f < 9000); cen = float((S[m] * f[m]).sum() / S[m].sum())
    d = np.mean(pm[int(t * SR):int((t + 0.15) * SR)] ** 2); r = np.mean(pm[int((t + 0.4) * SR):int((t + 2.5) * SR)] ** 2)
    return cen, 10 * np.log10(d / r)
qd = [dist(p["t"]) for p in phrases]; bd = [dist(b) for b in bells[:-1]]
print("DIST qin centroid %.0fHz D/R %+.1fdB | bell centroid %.0fHz D/R %+.1fdB" % (np.mean([q[0] for q in qd]), np.mean([q[1] for q in qd]), np.mean([b[0] for b in bd]), np.mean([b[1] for b in bd])))
print(f"DENSITY quiet_s(<=windfull-10dB) {quiet}  deep_s(<=-16dB) {deep}  jitter%(1-8Hz) {jitter:.1f}  swings/min {cross:.1f}  qin_notes {sum(len(p['notes']) for p in phrases)}")
if quiet < min_quiet:
    fails.append(("quiet_s>=", None, quiet, min_quiet))
for g in fails:
    print("FAIL", g)
print("ALL PASS" if not fails else f"FAILED {len(fails)}", "->", out)
