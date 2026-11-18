#!/usr/bin/env python3
"""
render_r6.py — 「有记忆的随机」离线预览。照搬 gen_bgm_guitar.py 的三层：
  作曲（有规矩、带记忆的随机） → 演奏（人味） → 发声（真实录音采样）

固定：钟＝增上寺＋大空间（Eric 第四轮选定）；风＝竹叶＋微风；水＝苏格兰小溪；
      开头只有竹叶、约 20s 水进来；结尾一声远钟、余音放完即止（Q11）。
新：古琴＝北京琴行实录（Freesound 161908，CC BY 4.0）里挑出的单音，按音高建池。

古琴作曲规则
  音池（低→高）：D2 · C3 · D3 · E3 · G3 · G4（泛音）——每个音高 1–4 条不同录音轮换
  乐句：一次 1–3 个音，音与音 1.8–3.4s；乐句之间 40–90s（Q5 定的范围）
  走法：下一音大多走一步（±1），偶尔两步，很少跳；跳了下一步往回收；不连弹同一音
  记忆：第一句是「动机」；之后每句随机取一种处理：新写 / 原样再现（最多连一次）/ 倒影 / 截短 / 平移一级
  阶段：入（前 10%）多为单音；中段 2–3 音；深（35–85%）变轻、变疏；归（最后 15%）回到单音
演奏人味：起音 ±40ms、力度 ±1.5dB、音高 ±5 音分、左右位置慢漂移、每个音一条新的混响尾
钟人味：力度 ±1.5dB、音高 ±0.8%、远近（空气吸收 2.6–3.6k）每次不同、每次新混响尾

用法：python render_r6.py --seed 11 --out R6_seed11.wav [--dur 360]
"""
import argparse, json, sys
import numpy as np
from scipy.signal import fftconvolve
sys.path.insert(0, "/Users/ew/zenscape/ab-demo")
import render_b as rb
import render_b3 as r3
import render_r4 as r4

SR = rb.SR
D = "/Users/ew/zenscape/ab-demo/"
QIN_SRC = rb.SRC + "fs/161908.mp3"
phone, pdb, space = r4.phone, r4.pdb, r4.space

# 音池：(名字, [(音头秒, 到下一音的间隔秒), ...])。由 qin_probe.py 的低频 YIN + 谐波峰确认：
#   C3≈130.3Hz（3/4/7/8 次谐波 391/521/912/1042）、D3≈145.8Hz、E3≈166.6Hz、G3≈197.2Hz、D2≈72.9Hz，
#   G4≈391Hz 是在 C3 弦上取的泛音（谐波峰集中在 380–392Hz，纯度 63–73%）。
POOL = [
    ("D2", [(28.80, 2.06), (34.34, 1.65)]),
    ("C3", [(10.78, 2.11), (24.82, 1.90), (51.74, 1.45), (61.82, 1.40)]),
    ("D3", [(1.47, 2.37), (6.22, 2.24), (15.14, 2.23)]),
    ("E3", [(49.07, 2.67)]),
    ("G3", [(46.70, 1.25)]),
    ("G4", [(26.72, 2.08), (63.22, 1.86), (53.19, 1.59), (57.60, 1.43)]),
]


def load_pool():
    x = rb.load(QIN_SRC)
    pool = []
    for name, takes in POOL:
        clips = []
        for t, gap in takes:
            c = r3.cut(x, t - 0.01, t + gap - 0.08, fin=0.004, fout=min(0.6, gap * 0.35))
            clips.append(r5_soften(c))
        pool.append((name, clips))
    return pool


def r5_soften(s, lp=4000, attack=0.006):
    y = rb.filt(s, "lowpass", lp, 2)
    a = int(attack * SR)
    y[:a] *= (np.linspace(0, 1, a, dtype=np.float32) ** 2)[:, None]
    return y


def micro_pitch(s, cents):
    r = 2 ** (cents / 1200.0)
    n = len(s); m = int(n / r)
    src = np.arange(m) * r
    return np.stack([np.interp(src, np.arange(n), s[:, c]) for c in range(s.shape[1])], 1).astype(np.float32)


# ---------------------------------------------------------------- 作曲
class Composer:
    def __init__(self, rng, npitch):
        self.rng = rng
        self.N = npitch
        self.motif = None          # (起始音高索引, [相对步进...], [音间隔...])
        self.repeated = 0
        self.last_pitch = 3        # 从 E3 附近起
        self.log = []

    def _step(self, cur, last_jump):
        r = self.rng
        if last_jump:                              # 跳了就往回收一步
            d = -int(np.sign(last_jump))
        else:
            d = r.choice([-1, 1, -1, 1, -1, 1, -2, 2, -3, 3], p=[.2, .2, .15, .15, .05, .05, .07, .07, .03, .03])
        nxt = cur + d
        if nxt < 0 or nxt >= self.N:
            nxt = cur - d
        nxt = int(np.clip(nxt, 0, self.N - 1))
        if nxt == cur:
            nxt = cur + (1 if cur < self.N - 1 else -1)
        return nxt, (d if abs(d) >= 2 else 0)

    def _new(self, k):
        r = self.rng
        start = int(np.clip(self.last_pitch + r.choice([-1, 0, 1]), 0, self.N - 1))
        rel, cur, j = [], start, 0
        for _ in range(k - 1):
            nxt, j = self._step(cur, j)
            rel.append(nxt - cur); cur = nxt
        gaps = [float(r.uniform(1.8, 3.4)) for _ in range(k - 1)]
        return start, rel, gaps

    def phrase(self, k):
        r = self.rng
        if self.motif is None or k == 1:
            if k == 1:
                start, _ = self._step(self.last_pitch, 0)
                rel, gaps = [], []
                kind = "单音"
            else:
                start, rel, gaps = self._new(k); kind = "新写"
                self.motif = (start, rel, gaps); self.repeated = 0
        else:
            opts = ["新写", "倒影", "截短", "平移", "再现"]
            w = np.array([0.25, 0.22, 0.13, 0.22, 0.18 if self.repeated < 1 else 0.0])
            kind = str(r.choice(opts, p=w / w.sum()))
            if kind == "截短" and len(self.motif[1]) == 0:
                kind = "平移"
            s0, rel0, g0 = self.motif
            if kind == "新写":
                start, rel, gaps = self._new(k); self.motif = (start, rel, gaps); self.repeated = 0
            elif kind == "再现":
                start, rel, gaps = s0, list(rel0), list(g0); self.repeated += 1
            elif kind == "倒影":
                start, rel, gaps = s0, [-d for d in rel0], list(g0); self.repeated = 0
            elif kind == "截短":
                start, rel, gaps = s0, list(rel0[:-1]), list(g0[:-1]); self.repeated = 0
            else:  # 平移一级
                start = int(np.clip(s0 + r.choice([-1, 1]), 0, self.N - 1)); rel, gaps = list(rel0), list(g0); self.repeated = 0
        # 落成绝对音高，越界就反弹
        ps = [start]
        for d in rel:
            n = ps[-1] + d
            if n < 0 or n >= self.N:
                n = ps[-1] - d
            ps.append(int(np.clip(n, 0, self.N - 1)))
        # 不连弹同一音（包括和上一句最后一音）
        if ps[0] == self.last_pitch:
            ps[0] = int(np.clip(ps[0] + (1 if ps[0] < self.N - 1 else -1), 0, self.N - 1))
        for i in range(1, len(ps)):
            if ps[i] == ps[i - 1]:
                ps[i] = ps[i] + (1 if ps[i] < self.N - 1 else -1)
        if kind == "新写" and len(ps) >= 2:
            self.motif = (ps[0], [b - a for a, b in zip(ps, ps[1:])], list(gaps[:len(ps) - 1]))
        self.last_pitch = ps[-1]
        self.log.append((kind, tuple(ps)))
        return kind, ps, gaps[:len(ps) - 1]


# 可调：疏密（r7 覆盖）
QIN_GAP = (40.0, 90.0)
NOTE_W = {"入": [.5, .5, 0], "定": [.15, .5, .35], "深": [.35, .45, .2], "归": [.6, .4, 0]}
BED_BREATH = False
MOTIF_MIN = 2
LOCAL_COMP = False


def phase_of(p):
    return "入" if p < .10 else "定" if p < .35 else "深" if p < .85 else "归"


def notes_for(ph, rng):
    w = NOTE_W[ph]
    return int(rng.choice([1, 2, 3], p=w))


def gain_for(ph):
    return {"入": 0.0, "定": 0.0, "深": -2.5, "归": -1.0}[ph]


# ---------------------------------------------------------------- 渲染
def build_bed(dur, rng):
    n = int(dur * SR)
    wind = r4.proposed_bed_wind(dur, rng, n)
    ws = r3.water_src("1_苏格兰小溪_Aviemore")
    ww = [ws[int(a * SR): int((a + 9) * SR)] for a in np.arange(0, len(ws) / SR - 9, 3.0)]
    water = rb.bed(ww, dur, rng, seg=(7, 9), xf=2.5)
    water = water * (10 ** ((r4.WATER_DB - pdb(water)) / 20))
    t = np.arange(n) / SR
    water = water * (np.clip((t - 20.0) / 12.0, 0, 1) ** 1.5)[:, None].astype(np.float32)
    if BED_BREATH:
        env = breath_env(n, rng)[:, None]
        wenv = env ** BREATH["water_exp"]     # 水跟着退，但退得浅一些（山涧不会停）
        # 风歇不是真空（Eric：太安静反而不对）：水留一层底，风在歇里还有很慢的余息
        wf = BREATH.get("water_floor")
        if wf is not None:
            wenv = np.maximum(wenv, np.float32(10 ** (wf / 20)))
        mur = BREATH.get("murmur")
        if mur:
            mrng = np.random.default_rng(int(LAST_LULLS[0][0] * 1000) + 7 if LAST_LULLS else 7)
            tt = np.arange(n, dtype=np.float32) / SR
            m = np.zeros(n, np.float32)
            for f in (float(mrng.uniform(0.035, 0.05)), float(mrng.uniform(0.06, 0.08))):
                m += np.sin(2 * np.pi * f * tt + float(mrng.uniform(0, 2 * np.pi))).astype(np.float32)
            gdb = 20 * np.log10(np.maximum(env[:, 0], 1e-6))
            w = np.clip(-gdb / max(1e-3, -BREATH["depth"]), 0, 1)       # 只在风歇里起作用
            env = env * (10 ** (mur * 0.5 * m * w / 20))[:, None].astype(np.float32)
        wind, water = wind * env, water * wenv
        if BREATH.get("level"):
            wind, water = level_passes(wind, water, n)
    return space(wind + water, rt60=2.6, wet=0.25, dry=0.9, lp=5000, seed=int(rng.integers(1 << 20)))[:n], wind


QIN_FAR = None
BELL_FAR = None
FAR_RNG = np.random.default_rng(2026)
LAST_LULLS = []
LAST_PLATEAUS = []
LAST_POCKETS = []
BREATH = dict(depth=-13.0, lull=(6, 14), ramp=(3, 5), gap=(25, 60), first=(30, 50), water_exp=0.6)


def pocket_env(n, cfg, avoid=()):
    """深静小窝（Eric：留一些 5–7s 的深度寂静）：在风歇的平台里，按概率挖一个更深的坑，
    风和水一起再退 cfg['depth'] dB，保持 hold 秒；下去 4–5s，回来 6–7s（smootherstep，满足 2s≤6dB 的涌起门槛）。
    独立 rng：不改变同一种子的钟/琴时间线。"""
    global LAST_POCKETS
    prng = np.random.default_rng(int(LAST_LULLS[0][0] * 1000) + 101 if LAST_LULLS else 101)
    g = np.zeros(n, np.float32)
    pockets = []
    for a, b in LAST_PLATEAUS:
        if prng.random() > cfg.get("prob", 0.75):
            continue
        hold = float(prng.uniform(*cfg["hold"])); dn = float(prng.uniform(*cfg.get("dn", (2.0, 2.5)))); up = float(prng.uniform(*cfg.get("up", (6.0, 7.0))))
        need = dn + hold + up
        if b - a < need + 6 or b > n / SR - 30:
            continue
        ok = []
        for st in np.arange(a + 3, b - 3 - need, 0.5):
            if all(st + need < x0 or st > x1 for x0, x1 in avoid):
                ok.append(float(st))
        if not ok:
            continue
        st = ok[int(prng.integers(len(ok)))]
        i0, i1, i2, i3 = (int(x * SR) for x in (st, st + dn, st + dn + hold, st + need))
        d = cfg["depth"]
        g[i0:i1] = np.minimum(g[i0:i1], d * _smooth(i1 - i0))
        g[i1:i2] = np.minimum(g[i1:i2], d)
        g[i2:i3] = np.minimum(g[i2:i3], d * (1 - _smooth(i3 - i2)))
        pockets.append((round(st + dn, 1), round(hold, 1)))
    LAST_POCKETS = pockets
    return (10 ** (g / 20)).astype(np.float32)


def level_passes(wind, water, n):
    """实测再拉平：每阵风满段（风歇之间）在手机模拟下取 1s RMS 的 p75，统一拉到各阵中位；
    前面风歇越长，这一阵再轻一点（每多静 8s 低 1dB，最多 -3）。增益在各阵中点之间按 dB 线性过渡，不会有台阶。
    原因：同一套包络下，素材窗口本身有亮有暗，随机的顶反而让某一阵更突出（Cpp3 第一轮实测）。"""
    bed = wind + water
    pm = phone(bed).mean(1)
    e = np.array([10 * np.log10(np.mean(pm[i:i + SR] ** 2) + 1e-12) for i in range(0, len(pm) - SR, SR)])
    L = LAST_LULLS
    bounds = [0.0] + [b for _, b, _ in L]; starts = [a for a, _, _ in L] + [n / SR]
    mids, p75, prevL = [], [], []
    for k, (a, b) in enumerate(zip(bounds, starts)):
        i0, i1 = int(a) + 2, int(b) - 1
        if i1 - i0 < 4:
            continue
        mids.append((a + b) / 2); p75.append(float(np.percentile(e[i0:i1], 75))); prevL.append(L[k - 1][2] if k > 0 else 0.0)
    if len(p75) < 2:
        return wind, water
    tgt = float(np.median(p75))
    gains = [float(np.clip(tgt - v - min(3.0, max(0.0, (pl - 30.0) / 8.0)), -8.0, 1.0)) for v, pl in zip(p75, prevL)]
    curve = np.interp(np.arange(n) / SR, mids, gains).astype(np.float32)
    gl = (10 ** (curve / 20))[:, None]
    return wind * gl, water * gl


def _smooth(n):
    """smootherstep 0→1：两端更缓，中段也不陡（比余弦更不『涌』）。"""
    x = np.linspace(0, 1, n, dtype=np.float32)
    return x * x * x * (x * (x * 6 - 15) + 10)


def breath_env(n, rng, lull_db=None):
    """底层呼吸：风歇（风＋水一起退），风回来比退下去更慢（up_mult 倍）。
    修复：风歇跨过结尾时，之前只做了下行渐变、平台段没写入，会在渐变结束瞬间跳回满音量（R8_Cpp 325.5s +16dB/0.5s）。
    现在所有段都裁到 n 内照常写入。"""
    B = BREATH
    lull_db = B["depth"] if lull_db is None else lull_db
    up_mult = B.get("up_mult", 1.0)
    g = np.zeros(n, np.float32)            # dB
    t = float(rng.uniform(*B["first"]))
    t0 = t
    lulls = []
    plateaus = []
    while t < n / SR - 20:
        L = float(rng.uniform(*B["lull"])); ramp = float(rng.uniform(*B["ramp"])); depth = lull_db + float(rng.uniform(-2, 2))
        up = ramp * up_mult
        a, b, c, d = (min(n, int(x * SR)) for x in (t, t + ramp, t + ramp + L, t + ramp + L + up))
        if b > a:
            g[a:b] = np.minimum(g[a:b], depth * _smooth(int(t * SR + ramp * SR) - int(t * SR))[: b - a])
        if c > b:
            g[b:c] = np.minimum(g[b:c], depth)
        if d > c:
            full = int((t + ramp + L + up) * SR) - int((t + ramp + L) * SR)
            g[c:d] = np.minimum(g[c:d], depth * (1 - _smooth(full))[: d - c])
        lulls.append((t, t + ramp + L + up, L))
        plateaus.append((t + ramp, t + ramp + L))
        t += L + ramp + up + float(rng.uniform(*B["gap"]))
    # 风过的「顶」：每一阵风回来不再都回到满音量（Eric：倒数 1:22 那阵偏响——它前面静了 49s、又是最长最亮的一阵）。
    # 每阵顶 -U(pass_db)；前面的静越长，回来越轻（对比补偿：每多静 10s 再低 1dB，最多 -4）。
    # 用独立的 rng，主 rng 的消耗顺序不变 → 同一种子的事件时间线不变，方便对比。
    global LAST_LULLS, LAST_PLATEAUS
    LAST_LULLS = list(lulls)
    LAST_PLATEAUS = list(plateaus)
    pr = B.get("pass_db")
    if pr:
        prng = np.random.default_rng(int(t0 * 1000))
        bounds = [0.0] + [e for _, e, _ in lulls]
        starts = [a for a, _, _ in lulls] + [n / SR]
        cx, cy = [], []
        for k, (a, b) in enumerate(zip(bounds, starts)):
            prev_L = lulls[k - 1][2] if k > 0 else 0.0
            top = -float(prng.uniform(*pr)) - min(4.0, max(0.0, (prev_L - 20.0) / 8.0))
            if k == 0:
                top = -float(prng.uniform(1.5, 2.5))   # 开头一阵也和后面齐平，不做全场最响
            cx.append((a + b) / 2); cy.append(top)
        # 顶的天花板：各阵中点之间线性插值（dB 域），风歇里本来就更低，所以不会产生台阶
        ceil = np.interp(np.arange(n) / SR, cx, cy).astype(np.float32)
        g = g + ceil          # 整阵（含两侧风歇）一起平移：风满变轻，风歇的相对深度不变（min 会让风歇显得变浅）
    return (10 ** (g / 20)).astype(np.float32)


def bell_strike(base, rng, head_db):
    B = BELL_FAR or dict(lp=(2600, 3600), rt60=(6.5, 7.5), wet=0.65, dry=0.6, predelay=0.09, rlp=3000, head=0.0)
    s = micro_pitch(base, float(rng.uniform(-14, 14)))            # ±0.8%
    u_lp, u_rt = float(rng.uniform(0, 1)), float(rng.uniform(0, 1))   # 主 rng 消耗不变，映射到各自范围
    s = rb.filt(s, "lowpass", B["lp"][0] + u_lp * (B["lp"][1] - B["lp"][0]), 2)      # 每次远近略不同
    s = space(s, rt60=B["rt60"][0] + u_rt * (B["rt60"][1] - B["rt60"][0]), wet=B["wet"], dry=B["dry"], predelay=B["predelay"], lp=B["rlp"],
              seed=int(rng.integers(1 << 20)))
    return r4.set_phone_head(s, head_db + B["head"] + float(rng.uniform(-1.5, 1.5)))


def render(seed, dur, out):
    rng = np.random.default_rng(seed); n = int(dur * SR)
    bed, wind = build_bed(dur, rng)
    bed_p = pdb(bed[int(40 * SR):])

    # 钟：结尾一声收；中段约每 3 分钟一声（±15s）
    base_bell = r3.zojoji()
    blen = len(base_bell) / SR + 8.5
    end_bell = dur - blen
    bells, t = [], end_bell - 180 + float(rng.uniform(-15, 15))
    while t > 45:
        bells.insert(0, round(t, 2)); t -= 180 + float(rng.uniform(-15, 15))
    bells.append(round(end_bell, 2))

    # 古琴：乐句起点 40–90s，避开钟 ±18s，结尾钟前 20s 收住
    pool = load_pool()
    comp = Composer(rng, len(pool))
    take_last = {}
    ev = np.zeros((n + 60 * SR, 2), np.float32)
    phrases, tq, pan = [], 30.0 + float(rng.uniform(-4, 6)), float(rng.uniform(-0.2, 0.2))
    while tq < end_bell - 20:
        for b in bells:
            if abs(tq - b) <= 18:
                tq = b + 18.5
        if phrases and tq - phrases[-1]["t"] > QIN_GAP[1]:
            tq = phrases[-1]["t"] + QIN_GAP[1]
            for b in bells:
                if abs(tq - b) <= 18:
                    tq = b - 18.5
        if tq >= end_bell - 20:
            break
        ph = phase_of(tq / dur)
        k = notes_for(ph, rng)
        kind, ps, gaps = comp.phrase(k)
        pan = float(np.clip(pan + rng.normal(0, 0.15), -0.4, 0.4))
        tt = tq + float(rng.normal(0, 0.04))
        played = []
        for i, pi in enumerate(ps):
            name, clips = pool[pi]
            choices = [j for j in range(len(clips)) if j != take_last.get(pi)] or [0]
            j = int(rng.choice(choices)); take_last[pi] = j
            c = micro_pitch(clips[j], float(rng.uniform(-5, 5)))
            Q = QIN_FAR
            _rt = float(rng.uniform(5.5, 7.0))   # 主 rng 消耗与 C++5 完全相同 → 时间线不变
            if Q:   # 推远：先把直达声的高频削掉（空气吸收），再让混响占主导；随机量走独立 rng
                frng = FAR_RNG
                c = rb.filt(c, "lowpass", float(frng.uniform(*Q["air_lp"])), 2)
                _rt = float(frng.uniform(*Q["rt60"]))
            c = space(c, rt60=_rt, wet=Q["wet"] if Q else 0.7,
                      dry=Q["dry"] if Q else 0.75, predelay=Q["predelay"] if Q else 0.05, lp=Q["lp"] if Q else 4200,
                      seed=int(rng.integers(1 << 20)))
            # 按「此刻」的底补偿（风歇时底更静，琴跟着轻；风满时不被盖住）
            a0 = max(0, int((tt - 5) * SR)); a1 = max(a0 + SR, int(tt * SR))
            local = max(pdb(bed[a0:a1]), bed_p - 12.0) if LOCAL_COMP else bed_p
            lvl = local + (QIN_FAR["head"] if QIN_FAR else 10.0) + gain_for(ph) - 1.5 * i + float(rng.uniform(-1.5, 1.5))   # 句中渐轻
            c = r4.set_phone_head(c, lvl, sec=1.0)
            rb.place(ev, c, tt, 1.0, float(np.clip(pan + rng.normal(0, 0.05), -0.5, 0.5)))
            played.append(f"{name}#{j}")
            if i < len(gaps):
                tt += gaps[i] + float(rng.normal(0, 0.04))
        phrases.append({"t": round(tq, 2), "phase": ph, "kind": kind, "notes": played})
        tq += float(rng.uniform(*QIN_GAP))

    for b in bells:
        s = bell_strike(base_bell, rng, bed_p + 14.0)
        i = int(b * SR); e = min(len(ev), i + len(s)); ev[i:e] += s[: e - i]

    pk = BREATH.get("pockets") if BED_BREATH else None
    if pk:
        avoid = [(b - 3, b + 28) for b in bells] + [(p["t"] - 3, p["t"] + 14 + 3 * len(p["notes"])) for p in phrases]
        bed = bed * pocket_env(n, pk, avoid)[:, None]
    # 结尾：最后一声钟敲下 2s 后底层 10s 退掉，钟余音放完
    out_env = np.ones(n, np.float32)
    s0 = int((end_bell + 2) * SR); s1 = min(n, s0 + 10 * SR)
    out_env[s0:s1] = np.linspace(1, 0, s1 - s0); out_env[s1:] = 0
    mix = bed * out_env[:, None] + ev[:n]
    fi = 4 * SR
    mix[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    r3.write(out, mix)

    # ---- 门槛（手机模拟）
    pm = phone(mix).mean(1)
    db = lambda a, b: 10 * np.log10(np.mean(pm[int(a * SR):int(b * SR)] ** 2) + 1e-12)
    gates = [("bell", b, round(db(b, b + 3) - db(b - 5, b - 0.2), 1), 8.0) for b in bells]
    gates += [("qin", p["t"], round(db(p["t"], p["t"] + 1.5) - db(p["t"] - 5, p["t"] - 0.2), 1), 5.0) for p in phrases]
    gaps = [b["t"] - a["t"] for a, b in zip(phrases, phrases[1:])]
    gates.append(("qin_gap<=max", None, round(QIN_GAP[1] - max(gaps), 1), 0.0))
    gates.append(("qin_gap>=min-4", None, round(min(gaps) - (QIN_GAP[0] - 4), 1), 0.0))
    seqs = [tuple(p["notes"]) for p in phrases]
    gates.append(("no_identical_consecutive_phrase", None, -sum(a == b for a, b in zip(seqs, seqs[1:])), 0.0))
    allp = [nn.split("#")[0] for p in phrases for nn in p["notes"]]
    gates.append(("no_same_pitch_back_to_back", None, -sum(a == b for a, b in zip(allp, allp[1:])), 0.0))
    gates.append(("motif_reuse>=MIN", None, sum(p["kind"] in ("再现", "倒影", "截短", "平移") for p in phrases) - MOTIF_MIN, 0.0))
    pb = phone(bed * out_env[:, None]).mean(1)
    eb = np.array([10 * np.log10(np.mean(pb[i:i + SR // 2] ** 2) + 1e-12) for i in range(0, len(pb) - SR // 2, SR // 2)])
    lo, hi = 10, int((end_bell - 1) * 2)
    rises = [eb[i + 4] - eb[i] for i in range(lo, hi - 4)]
    jumps = [eb[i + 1] - eb[i] for i in range(lo, hi - 1)]
    gates.append(("bed_max_rise_2s<=6dB", None, round(6 - max(rises), 1), 0.0))
    gates.append(("bed_max_jump_0.5s<=2dB", None, round(2 - max(jumps), 1), 0.0))
    gates.append(("qin_clear_of_bells", None, -sum(any(abs(p["t"] - b) <= 18 for b in bells) for p in phrases), 0.0))
    gates.append(("tail_silent_last_1s", None, round(-60 - db(dur - 1, dur), 1), 0.0))
    d = np.abs(np.diff(mix.mean(1)))
    gates.append(("clicks", None, -int((d > 0.25).sum()), 0.0))
    return bells, phrases, gates


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dur", type=float, default=360.0)
    a = ap.parse_args()
    bells, phrases, gates = render(a.seed, a.dur, D + a.out)
    print("bells", bells)
    for p in phrases:
        print(f"  {p['t']:7.2f}s [{p['phase']}] {p['kind']:3s} {' → '.join(p['notes'])}")
    ok = True
    for g in gates:
        passed = g[2] >= g[3]; ok &= passed
        if not passed or g[0] not in ("qin", "bell"):
            print("GATE", g[0], g[1], g[2], ">=", g[3], "PASS" if passed else "FAIL")
    fails = [g for g in gates if g[2] < g[3]]
    print("ALL PASS" if ok else f"FAILED {len(fails)}")
    json.dump({"bells": bells, "phrases": phrases}, open(D + a.out.replace(".wav", "_events.json"), "w"), ensure_ascii=False, indent=1)
    sys.exit(0 if ok else 3)
