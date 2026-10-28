/**
 * 一段会话的完整「乐谱」：纯函数，不碰 Web Audio，便于测试和复现。
 * 移植自 ab-demo/render_r6.py + render_r8.py 的 Cpp6 预设（Eric 定稿的 C++6）。
 *
 * 程序只决定「何时、何处、多大」；声音全部来自 public/audio/v2 的真实录音。
 *
 * 电平单位：「手机 dB」——和 Python 参考版一样，在手机外放模拟（HP300 4 阶 + LP9k）下的 RMS dB。
 * 底层的手机响度用模型估算（各层能量占比 × 包络），用于两件事：每阵风拉平、古琴按此刻的底补偿。
 */
import { Composer, type PhraseKind } from './composer'
import { phaseOf, type PhaseKey, type V2Preset } from './preset'
import { choice, clamp, derive, normal, randInt, uniform, type Rng } from './rng'

// ───────────────────────── 素材清单（public/audio/v2/soundscape.json）

export interface TextureFile {
  file: string
  gainDb: number
  durSec: number
  seg: [number, number]
  xf: number
  /** 素材自身的响度起伏（手机模拟，0.5s 窗，相对整条的 dB），loudRate 点/秒 */
  loudRate?: number
  loudDb?: number[]
}
export interface SoundscapeManifest {
  sampleRate: number
  files: {
    bamboo: TextureFile & { windowSec: number; windows: number; driftDb: number; driftPeriod: [number, number] }
    breeze: TextureFile & { windowSec: number; windows: number[] }
    water: TextureFile & { windowSec: number; windowStep: number; fadeInAt: number; fadeInSec: number }
    bell: { file: string; gainDb: number; headDb: number; headSec: number; durSec: number }
  }
  bed: {
    fullPhoneDb: number
    bambooShareOfWind: number
    windShare: number
    waterShare: number
    space: { rt60: number; wet: number; dry: number; predelay: number; lp: number }
  }
  qin: { pitches: string[]; clips: { file: string; pitch: string; take: number; gainDb: number; headDb: number }[] }
  credits: { role: string; id: string; title: string; author: string; license: string; url: string }[]
}

// ───────────────────────── 乐谱结构

export type Layer = 'bamboo' | 'breeze' | 'water'

/** 纹理里的一段：从素材 offset 处取 len 秒，放在 at 秒，首尾 xf 秒等功率交叉 */
export interface TextureSegment {
  layer: Layer
  at: number
  offset: number
  len: number
  xf: number
  swapLR: boolean
}

export interface QinNote {
  at: number
  clip: number
  pitch: string
  take: number
  cents: number
  pan: number
  gainDb: number
  airLp: number
  rt60: number
  irSeed: number
}

export interface Phrase {
  at: number
  phase: PhaseKey
  kind: PhraseKind
  notes: QinNote[]
}

export interface BellStrike {
  at: number
  cents: number
  lp: number
  rt60: number
  gainDb: number
  irSeed: number
  final: boolean
}

export interface Lull {
  start: number
  end: number
  len: number
  plateau: [number, number]
}

export interface Pocket {
  start: number
  hold: number
  dn: number
  up: number
}

export interface SessionPlan {
  seed: number
  dur: number
  /** 控制率（Hz）。包络数组每秒 ctrlRate 个点 */
  ctrlRate: number
  /** 各层包络（dB），已含：风歇、余息、拉平、水保底、水入场、竹叶漂移 */
  envDb: Record<Layer, Float32Array>
  /** 底层整体（混响之后）：深静小窝 + 结尾退场（dB） */
  bedOutDb: Float32Array
  /** 模型估算的底层手机响度（不含深静与结尾），dB */
  bedPhoneDb: Float32Array
  bedRefDb: number
  segments: TextureSegment[]
  lulls: Lull[]
  pockets: Pocket[]
  bells: BellStrike[]
  phrases: Phrase[]
  bedIrSeed: number
  endBell: number
}

// ───────────────────────── 工具

const CTRL = 20
const FADE_IN = 4
/** 底层模型响度往上最快 dB/s（门槛：2s ≤ 6dB、0.5s ≤ 2dB；留出模型误差） */
const MAX_RISE = 2.2
/**
 * 风满时的绝对电平对齐定稿 C++6（实测各阵 p75 ≈ -41.1 手机 dB）。
 * 参考版拉平时「前面静得久就再轻最多 3dB」，整体被压低了约 2dB；这里把那一项收到 0.8dB（避免某一阵突出），
 * 所以要把整体电平补回去，否则风满比定稿响 2.2dB（3 个种子实测 -38.9 vs -41.1）。
 */
const PASS_TRIM_DB = -2.2

/** smootherstep 0→1 */
export function smooth(x: number): number {
  const t = clamp(x, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

const dbToPow = (db: number) => Math.pow(10, db / 10)
const powToDb = (p: number) => 10 * Math.log10(Math.max(p, 1e-12))

function percentile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

function median(xs: number[]): number {
  return percentile(xs, 0.5)
}

/** np.interp：两端外推取端点值 */
function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let i = 1
  while (xs[i] < x) i++
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
  return ys[i - 1] + t * (ys[i] - ys[i - 1])
}

// ───────────────────────── 纹理：随机起点的片段，等功率交叉，不连续重复同一窗

function texture(
  layer: Layer,
  rng: Rng,
  dur: number,
  windows: { offset: number; len: number }[],
  seg: [number, number],
  xf: number,
): TextureSegment[] {
  const out: TextureSegment[] = []
  let pos = 0
  let last = -1
  while (pos < dur + 1 - xf) {
    let i = randInt(rng, windows.length)
    if (i === last && windows.length > 1) i = (i + 1) % windows.length
    last = i
    const w = windows[i]
    const len = Math.min(uniform(rng, seg[0], seg[1]), w.len - 1 / 48000)
    const st = uniform(rng, 0, Math.max(0, w.len - len))
    out.push({ layer, at: pos, offset: w.offset + st, len, xf, swapLR: rng() < 0.5 })
    pos += len - xf
  }
  return out
}

// ───────────────────────── 种子筛选

/** 乐谱层面的验收（模型估算，手机 dB）：够疏、几阵风一样大。返回不合格原因，空 = 合格 */
export function planIssues(p: SessionPlan, quietMin = 135 / 295): string[] {
  const R = p.ctrlRate
  const a = 35
  const b = Math.max(a + 60, Math.floor(p.endBell) - 10)
  const e: number[] = []
  for (let s = a; s < b; s++) {
    let acc = 0
    for (let k = 0; k < R; k++) acc += Math.pow(10, (p.bedPhoneDb[s * R + k] + p.bedOutDb[s * R + k]) / 10)
    e.push(10 * Math.log10(acc / R))
  }
  const p90 = percentile(e, 0.9)
  const issues: string[] = []
  const quietFrac = e.filter((v) => v <= p90 - 10).length / e.length
  // 6 分钟定稿 C++6 实测 147/295 ≈ 0.50；模型比实测高约 10s，所以门槛按 135/295
  if (quietFrac < quietMin) issues.push(`quiet ${(quietFrac * 100).toFixed(0)}%`)
  const runs: number[] = []
  let s0 = -1
  e.forEach((v, i) => {
    const full = v > p90 - 6
    if (full && s0 < 0) s0 = i
    if ((!full || i === e.length - 1) && s0 >= 0) {
      if (i - s0 >= 8) runs.push(percentile(e.slice(s0, i), 0.75))
      s0 = -1
    }
  })
  if (runs.length >= 2 && Math.max(...runs) - median(runs) > 0.8) issues.push(`pass spread ${(Math.max(...runs) - median(runs)).toFixed(1)}dB`)
  return issues
}

/**
 * 实时引擎没法「多渲几个挑好的」，但乐谱是纯函数、很便宜：同一种子派生最多 16 个候选，取第一个合格的。
 * 同一 seed 永远得到同一段（可复现）。
 */
export function planSession(seed: number, durSec: number, P: V2Preset, M: SoundscapeManifest): SessionPlan {
  let first: SessionPlan | null = null
  for (let k = 0; k < 16; k++) {
    const s = k === 0 ? seed >>> 0 : (Math.imul(seed ^ 0x5bd1e995, k + 1) + k * 0x27d4eb2d) >>> 0
    const p = buildPlan(s, durSec, P, M)
    if (!first) first = p
    if (planIssues(p, P.quietMin).length === 0) return p
  }
  return first!
}

// ───────────────────────── 主入口

export function buildPlan(seed: number, durSec: number, P: V2Preset, M: SoundscapeManifest): SessionPlan {
  const dur = Math.max(60, durSec)
  const n = Math.ceil(dur * CTRL) + 1
  const T = (i: number) => i / CTRL

  // 互不影响的随机子流：改一处参数，不会把整条时间线都挪动
  const rTex = derive(seed, 1)
  const rBreath = derive(seed, 2)
  const rEvent = derive(seed, 3)
  const rFar = derive(seed, 4)
  const rPocket = derive(seed, 5)
  const rMurmur = derive(seed, 6)
  const rDrift = derive(seed, 7)

  // ── 纹理片段
  const F = M.files
  const bambooWins = Array.from({ length: F.bamboo.windows }, (_, k) => ({ offset: k * F.bamboo.windowSec, len: F.bamboo.windowSec }))
  const breezeWins = F.breeze.windows.map((o) => ({ offset: o, len: F.breeze.windowSec }))
  const waterWins: { offset: number; len: number }[] = []
  for (let a = 0; a < F.water.durSec - F.water.windowSec; a += F.water.windowStep) waterWins.push({ offset: a, len: F.water.windowSec })
  const segments = [
    ...texture('bamboo', rTex, dur, bambooWins, F.bamboo.seg, F.bamboo.xf),
    ...texture('breeze', rTex, dur, breezeWins, F.breeze.seg, F.breeze.xf),
    ...texture('water', rTex, dur, waterWins, F.water.seg, F.water.xf),
  ]

  // ── 风歇（dB 包络，风用）
  const B = P.breath
  const g = new Float32Array(n)
  const lulls: Lull[] = []
  let t = uniform(rBreath, B.first[0], B.first[1])
  while (t < dur - 20) {
    const L = uniform(rBreath, B.lull[0], B.lull[1])
    const ramp = uniform(rBreath, B.ramp[0], B.ramp[1])
    const depth = B.depthDb + uniform(rBreath, -2, 2)
    const up = ramp * B.upMult
    for (let i = Math.floor(t * CTRL); i < n && T(i) <= t + ramp + L + up; i++) {
      const x = T(i)
      if (x < t) continue
      const v =
        x < t + ramp ? depth * smooth((x - t) / ramp) : x < t + ramp + L ? depth : depth * (1 - smooth((x - t - ramp - L) / up))
      g[i] = Math.min(g[i], v)
    }
    lulls.push({ start: t, end: t + ramp + L + up, len: L, plateau: [t + ramp, t + ramp + L] })
    t += L + ramp + up + uniform(rBreath, B.gap[0], B.gap[1])
  }

  // 水：跟着退但更浅，并保底；风：歇里加很慢的余息
  const waterBreath = new Float32Array(n)
  const windBreath = new Float32Array(n)
  const f1 = uniform(rMurmur, 0.035, 0.05)
  const p1 = uniform(rMurmur, 0, 2 * Math.PI)
  const f2 = uniform(rMurmur, 0.06, 0.08)
  const p2 = uniform(rMurmur, 0, 2 * Math.PI)
  for (let i = 0; i < n; i++) {
    waterBreath[i] = Math.max(g[i] * B.waterExp, B.waterFloorDb)
    const m = Math.sin(2 * Math.PI * f1 * T(i) + p1) + Math.sin(2 * Math.PI * f2 * T(i) + p2)
    const w = clamp(-g[i] / Math.max(1e-3, -B.depthDb), 0, 1)
    windBreath[i] = g[i] + B.murmurDb * 0.5 * m * w
  }

  // 竹叶慢漂移（3 条不相关慢正弦）
  const drift = new Float32Array(n)
  const dps = [0, 1, 2].map(() => [uniform(rDrift, F.bamboo.driftPeriod[0], F.bamboo.driftPeriod[1]), uniform(rDrift, 0, 6.28)])
  for (let i = 0; i < n; i++) {
    let s = 0
    for (const [per, ph] of dps) s += Math.sin((2 * Math.PI * T(i)) / per + ph)
    drift[i] = (s / 3) * F.bamboo.driftDb
  }

  // 水入场（约 20s 后，12s 渐入，幅度 ^1.5）
  const waterIn = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = clamp((T(i) - F.water.fadeInAt) / F.water.fadeInSec, 0, 1)
    waterIn[i] = a <= 0 ? -120 : 20 * Math.log10(Math.pow(a, 1.5))
  }

  // ── 素材本身的响度起伏：按实际排出的片段与交叉淡化权重算（竹叶窗口之间亮暗差可达 ±6dB）
  const material: Record<Layer, Float32Array> = {
    bamboo: new Float32Array(n),
    breeze: new Float32Array(n),
    water: new Float32Array(n),
  }
  for (const layer of ['bamboo', 'breeze', 'water'] as Layer[]) {
    const tf = F[layer] as TextureFile
    const curve = tf.loudDb
    const rate = tf.loudRate ?? 10
    const pow = new Float32Array(n)
    const wsum = new Float32Array(n)
    for (const sg of segments) {
      if (sg.layer !== layer) continue
      const xf = Math.min(sg.xf, sg.len / 2)
      for (let i = Math.max(0, Math.ceil(sg.at * CTRL)); i < n && T(i) < sg.at + sg.len; i++) {
        const u = T(i) - sg.at
        const w = u < xf ? Math.sin(((u / xf) * Math.PI) / 2) : u > sg.len - xf ? Math.cos((((u - (sg.len - xf)) / xf) * Math.PI) / 2) : 1
        const w2 = w * w
        let m = 0
        if (curve && curve.length) {
          const x = (sg.offset + u) * rate
          const k = Math.min(curve.length - 2, Math.max(0, Math.floor(x)))
          m = curve[k] + (curve[k + 1] - curve[k]) * clamp(x - k, 0, 1)
        }
        pow[i] += w2 * dbToPow(m)
        wsum[i] += w2
      }
    }
    // 交叉处 Σw² 不恒为 1（实际电平也会跟着变），所以直接用 pow，不除 wsum
    for (let i = 0; i < n; i++) material[layer][i] = powToDb(pow[i])
  }

  // ── 模型：底层手机响度（拉平前）
  const sBam = M.bed.windShare * M.bed.bambooShareOfWind
  const sBrz = M.bed.windShare * (1 - M.bed.bambooShareOfWind)
  const sWat = M.bed.waterShare
  const waterDb = P.waterDb
  const model = (i: number, lvl = 0) =>
    M.bed.fullPhoneDb +
    lvl +
    powToDb(
      sBam * dbToPow(windBreath[i] + drift[i] + material.bamboo[i]) +
        sBrz * dbToPow(windBreath[i] + material.breeze[i]) +
        sWat * dbToPow(waterBreath[i] + waterIn[i] + waterDb + material.water[i]),
    )

  // ── 每阵风拉平：各阵（风歇之间）1s 响度的 p75 拉到中位；前面静得越久，这阵再轻一点
  const level = new Float32Array(n)
  const sec = (fn: (i: number) => number) => {
    const out: number[] = []
    for (let s = 0; s < Math.floor(dur); s++) {
      let p = 0
      for (let k = 0; k < CTRL; k++) p += dbToPow(fn(s * CTRL + k))
      out.push(powToDb(p / CTRL))
    }
    return out
  }
  const e0 = sec((i) => model(i))
  const bounds = [0, ...lulls.map((l) => l.end)]
  const starts = [...lulls.map((l) => l.start), dur]
  const mids: number[] = []
  const p75s: number[] = []
  const prevL: number[] = []
  const segRanges: [number, number][] = [] // 诊断用
  // 增益：每阵风满时恒定，只在风歇平台里（风已退 15dB）换挡 → 拉平不会被听成「有人在推推子」
  const passIdx: number[] = []
  const fillLevel = (gains: number[]) => {
    const xs: number[] = []
    const ys: number[] = []
    passIdx.forEach((k, j) => {
      const a = k > 0 ? lulls[k - 1].plateau[1] : 0
      const b = k < lulls.length ? lulls[k].plateau[0] : dur
      xs.push(a, b)
      ys.push(gains[j], gains[j])
    })
    for (let i = 0; i < n; i++) level[i] = interp(T(i), xs, ys)
  }
  // 只量离风满 6dB 以内的秒——和验收口径一致（verify_engine.py：离风满 6dB 以内的连续段）
  const fullSecs = (a: number, b: number) => {
    const out: number[] = []
    for (let sI = Math.max(Math.floor(a), FADE_IN + 1); sI < Math.min(Math.floor(b), Math.floor(dur)); sI++) {
      if (g[sI * CTRL] > -6 && g[Math.min(n - 1, sI * CTRL + CTRL - 1)] > -6) out.push(sI)
    }
    return out
  }
  const segSecs: number[][] = []
  bounds.forEach((a, k) => {
    const b = starts[k]
    const ss = fullSecs(a, b)
    if (ss.length < 4) return
    segSecs.push(ss)
    passIdx.push(k)
    segRanges.push([ss[0], ss[ss.length - 1] + 1])
    mids.push((a + b) / 2)
    p75s.push(percentile(ss.map((x) => e0[x]), 0.75))
    prevL.push(k > 0 ? lulls[k - 1].len : 0)
  })
  if (p75s.length >= 2) {
    // 前面静得越久，这阵略轻一点——但最多 0.8dB。参考版允许到 3dB，结果「短歇之后那阵」反而比其他阵高 2–3dB，
    // 正是 Eric 说的「倒数 1:22 那一段偏响」（40 个种子里 14 个超 1dB）
    const bias = prevL.map((pl) => Math.min(0.8, Math.max(0, (pl - 30) / 40)))
    // 目标只按「水已经进来」之后的各阵算（开头那阵水还在渐入，本来就轻，不该把别的阵往下拉）
    const settled = mids.map((m) => m > F.water.fadeInAt + F.water.fadeInSec)
    const pick = <T,>(xs: T[]) => (settled.some(Boolean) ? xs.filter((_, k) => settled[k]) : xs)
    const tgt = median(pick(p75s)) + PASS_TRIM_DB
    const gains = p75s.map((v, k) => clamp(tgt - v - bias[k], -8, 1))
    fillLevel(gains)
    // 再拉两轮：线性插值的增益会被相邻阵「拖」一点，单轮拉不平（Python 参考版同样只拉一轮，换种子时最响一阵常高 1.5–2dB）。
    // 每轮在已加增益的模型上重测各阵 p75，只修残差
    for (let it = 0; it < 2; it++) {
      const e1 = sec((i) => model(i, level[i]))
      const now = segSecs.map((ss) => percentile(ss.map((x) => e1[x]), 0.75))
      const want = median(pick(now.map((v, k) => v + bias[k])))
      for (let k = 0; k < gains.length; k++) gains[k] = clamp(gains[k] + (want - bias[k] - now[k]), -8, 1)
      fillLevel(gains)
    }
  }

  const envDb: Record<Layer, Float32Array> = {
    bamboo: new Float32Array(n),
    breeze: new Float32Array(n),
    water: new Float32Array(n),
  }
  const bedPhoneDb = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    envDb.bamboo[i] = windBreath[i] + drift[i] + level[i]
    envDb.breeze[i] = windBreath[i] + level[i]
    envDb.water[i] = waterBreath[i] + waterIn[i] + waterDb + level[i]
    bedPhoneDb[i] = model(i, level[i])
  }
  // 全场底（40s 以后）
  let acc = 0
  let cnt = 0
  for (let i = Math.min(n - 1, 40 * CTRL); i < n; i++) {
    acc += dbToPow(bedPhoneDb[i])
    cnt++
  }
  const bedRefDb = powToDb(acc / Math.max(1, cnt))

  // ── 钟：结尾一声收；往前约每 every 秒一声
  const bellTail = F.bell.durSec + 8.5
  const endBell = dur - bellTail
  const bellTimes: number[] = []
  let tb = endBell - P.bell.every + uniform(rEvent, -P.bell.jitter, P.bell.jitter)
  while (tb > 45) {
    bellTimes.unshift(tb)
    tb -= P.bell.every + uniform(rEvent, -P.bell.jitter, P.bell.jitter)
  }
  bellTimes.push(endBell)

  // ── 古琴
  const pitches = M.qin.pitches
  const clipsBy = pitches.map((p) => M.qin.clips.map((c, k) => ({ ...c, k })).filter((c) => c.pitch === p))
  const composer = new Composer(rEvent, pitches.length)
  const takeLast = new Map<number, number>()
  const phrases: Phrase[] = []
  const localAt = (tt: number) => {
    const a = clamp(Math.floor((tt - 5) * CTRL), 0, n - 1)
    const b = clamp(Math.max(a + CTRL, Math.floor(tt * CTRL)), 0, n)
    let p = 0
    for (let i = a; i < b; i++) p += dbToPow(bedPhoneDb[i])
    return Math.max(powToDb(p / Math.max(1, b - a)), bedRefDb - P.qin.localFloorBelowBedDb)
  }
  let tq = 30 + uniform(rEvent, -4, 6)
  let pan = uniform(rEvent, -0.2, 0.2)
  while (tq < endBell - 20) {
    for (const b of bellTimes) if (Math.abs(tq - b) <= 18) tq = b + 18.5
    if (phrases.length && tq - phrases[phrases.length - 1].at > P.qin.gap[1]) {
      tq = phrases[phrases.length - 1].at + P.qin.gap[1]
      for (const b of bellTimes) if (Math.abs(tq - b) <= 18) tq = b - 18.5
    }
    if (tq >= endBell - 20) break
    const ph = phaseOf(tq / dur)
    const k = choice(rEvent, [1, 2, 3], P.qin.noteWeights[ph])
    const { kind, pitches: ps, gaps } = composer.phrase(k)
    pan = clamp(pan + normal(rEvent, 0, 0.15), -0.4, 0.4)
    let tt = tq + normal(rEvent, 0, 0.04)
    const notes: QinNote[] = []
    ps.forEach((pi, i) => {
      const takes = clipsBy[pi]
      const opts = takes.filter((c) => c.take !== takeLast.get(pi))
      const c = choice(rEvent, opts.length ? opts : takes)
      takeLast.set(pi, c.take)
      const lvl = localAt(tt) + P.qin.overLocalDb + P.qin.phaseGainDb[ph] - 1.5 * i + uniform(rEvent, -1.5, 1.5)
      notes.push({
        at: tt,
        clip: c.k,
        pitch: c.pitch,
        take: c.take,
        cents: uniform(rEvent, -5, 5),
        pan: clamp(pan + normal(rEvent, 0, 0.05), -0.5, 0.5),
        gainDb: lvl - c.headDb,
        airLp: uniform(rFar, P.qin.far.airLp[0], P.qin.far.airLp[1]),
        rt60: uniform(rFar, P.qin.far.rt60[0], P.qin.far.rt60[1]),
        irSeed: Math.floor(rFar() * 2 ** 31),
      })
      if (i < gaps.length) tt += gaps[i] + normal(rEvent, 0, 0.04)
    })
    phrases.push({ at: tq, phase: ph, kind, notes })
    tq += uniform(rEvent, P.qin.gap[0], P.qin.gap[1])
  }

  const bells: BellStrike[] = bellTimes.map((at, k) => ({
    at,
    cents: uniform(rEvent, -14, 14),
    lp: uniform(rFar, P.bell.far.lp[0], P.bell.far.lp[1]),
    rt60: uniform(rFar, P.bell.far.rt60[0], P.bell.far.rt60[1]),
    gainDb:
      Math.max(bedRefDb + P.bell.overBedDb, P.bell.overLocalMinDb === undefined ? -Infinity : localAt(at) + P.bell.overLocalMinDb) +
      P.bell.far.headDb +
      uniform(rEvent, -1.5, 1.5) -
      F.bell.headDb,
    irSeed: Math.floor(rFar() * 2 ** 31),
    final: k === bellTimes.length - 1,
  }))

  // ── 深静小窝：只在风歇平台里，避开钟和琴的余音
  const avoid: [number, number][] = [
    ...bellTimes.map((b) => [b - 3, b + 28] as [number, number]),
    ...phrases.map((p) => [p.at - 3, p.at + 14 + 3 * p.notes.length] as [number, number]),
  ]
  const pockets: Pocket[] = []
  const PK = P.pockets
  for (const l of lulls) {
    const [a, b] = l.plateau
    if (rPocket() > PK.prob) continue
    const hold = uniform(rPocket, PK.hold[0], PK.hold[1])
    const dn = uniform(rPocket, PK.dn[0], PK.dn[1])
    const up = uniform(rPocket, PK.up[0], PK.up[1])
    const need = dn + hold + up
    if (b - a < need + 6 || b > dur - 30) continue
    const ok: number[] = []
    for (let st = a + 3; st < b - 3 - need; st += 0.5) {
      if (avoid.every(([x0, x1]) => st + need < x0 || st > x1)) ok.push(st)
    }
    if (!ok.length) continue
    pockets.push({ start: ok[randInt(rPocket, ok.length)], hold, dn, up })
  }

  // ── 底层整体：深静 + 结尾（最后一声钟敲下 2s 后底层 10s 线性退掉）
  const bedOutDb = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = T(i)
    let v = 0
    for (const p of pockets) {
      const s1 = p.start + p.dn
      const s2 = s1 + p.hold
      const s3 = s2 + p.up
      if (x >= p.start && x < s3) {
        const d = x < s1 ? PK.depthDb * smooth((x - p.start) / p.dn) : x < s2 ? PK.depthDb : PK.depthDb * (1 - smooth((x - s2) / p.up))
        v = Math.min(v, d)
      }
    }
    const a = clamp(1 - (x - (endBell + 2)) / 10, 0, 1)
    const fi = clamp(x / FADE_IN, 0, 1)
    bedOutDb[i] = v + (a <= 0 ? -120 : 20 * Math.log10(a)) + (fi <= 0 ? -120 : 20 * Math.log10(fi))
  }

  // ── 底层抬升限速：模型响度（含深静）往上走最快 MAX_RISE dB/s；往下不限。
  //    素材里竹叶一阵亮起、深静回来、风回来叠在一起时，会比 C++6 的「2s ≤ 6dB」更陡（实测 6.0–7.0dB）。
  //    做法：y = min(x, y_prev + slope·dt)，差值（≤0）记进底层整体增益
  {
    const x = new Float32Array(n)
    for (let i = 0; i < n; i++) x[i] = bedPhoneDb[i] + bedOutDb[i]
    const corr = new Float32Array(n)
    const i0 = Math.ceil(FADE_IN * CTRL)
    let y = x[Math.min(i0, n - 1)]
    const step = MAX_RISE / CTRL
    const stop = Math.floor((endBell + 1.5) * CTRL)
    for (let i = i0; i < Math.min(n, stop); i++) {
      y = Math.min(x[i], y + step)
      corr[i] = y - x[i]
    }
    // 不再额外平滑：修正量本身就是连续的（素材响度曲线是 0.5s 窗），控制点之间由 setValueCurveAtTime 线性插值。
    // 做过「最小值滤波」平滑，会把修正的回弹挪到 x 已经不降的地方，反而造出 2dB/0.5s 的跳（30 分钟测试实测）
    for (let i = 0; i < n; i++) bedOutDb[i] += corr[i]
  }

  return {
    seed,
    dur,
    ctrlRate: CTRL,
    envDb,
    bedOutDb,
    bedPhoneDb,
    bedRefDb,
    segments,
    lulls,
    pockets,
    bells,
    phrases,
    bedIrSeed: Math.floor(rFar() * 2 ** 31),
    endBell,
  }
}
