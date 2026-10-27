/**
 * 古琴作曲：有记忆的随机（移植自 ab-demo/render_r6.py 的 Composer）。
 * - 下一音大多走一步，偶尔两步，很少跳；跳了下一步往回收
 * - 不连弹同一音（包括和上一句最后一音）
 * - 第一句多音乐句是「动机」，之后：新写 / 原样再现（最多连一次）/ 倒影 / 截短 / 平移一级
 */
import { choice, clamp, uniform, type Rng } from './rng'

export type PhraseKind = '单音' | '新写' | '再现' | '倒影' | '截短' | '平移'

interface Motif {
  start: number
  rel: number[]
  gaps: number[]
}

export interface ComposedPhrase {
  kind: PhraseKind
  pitches: number[]
  gaps: number[]
}

const STEPS = [-1, 1, -1, 1, -1, 1, -2, 2, -3, 3]
const STEP_W = [0.2, 0.2, 0.15, 0.15, 0.05, 0.05, 0.07, 0.07, 0.03, 0.03]
const KINDS: PhraseKind[] = ['新写', '倒影', '截短', '平移', '再现']

export class Composer {
  private readonly rng: Rng
  private readonly n: number
  private motif: Motif | null = null
  private repeated = 0
  private lastPitch: number
  private lastPhrase: number[] = []

  constructor(rng: Rng, pitchCount: number) {
    this.rng = rng
    this.n = pitchCount
    this.lastPitch = Math.min(3, pitchCount - 1)
  }

  private step(cur: number, lastJump: number): [number, number] {
    const d = lastJump ? -Math.sign(lastJump) : choice(this.rng, STEPS, STEP_W)
    let nxt = cur + d
    if (nxt < 0 || nxt >= this.n) nxt = cur - d
    nxt = clamp(nxt, 0, this.n - 1)
    if (nxt === cur) nxt = cur + (cur < this.n - 1 ? 1 : -1)
    return [nxt, Math.abs(d) >= 2 ? d : 0]
  }

  private fresh(k: number): Motif {
    const start = clamp(this.lastPitch + choice(this.rng, [-1, 0, 1]), 0, this.n - 1)
    const rel: number[] = []
    let cur = start
    let jump = 0
    for (let i = 0; i < k - 1; i++) {
      const [nxt, j] = this.step(cur, jump)
      rel.push(nxt - cur)
      cur = nxt
      jump = j
    }
    const gaps = Array.from({ length: k - 1 }, () => uniform(this.rng, 1.8, 3.4))
    return { start, rel, gaps }
  }

  phrase(k: number): ComposedPhrase {
    let kind: PhraseKind
    let m: Motif
    if (this.motif === null || k === 1) {
      if (k === 1) {
        m = { start: this.step(this.lastPitch, 0)[0], rel: [], gaps: [] }
        kind = '单音'
      } else {
        m = this.fresh(k)
        kind = '新写'
        this.repeated = 0
      }
    } else {
      const w = [0.25, 0.22, 0.13, 0.22, this.repeated < 1 ? 0.18 : 0]
      kind = choice(this.rng, KINDS, w)
      if (kind === '截短' && this.motif.rel.length === 0) kind = '平移'
      const base = this.motif
      if (kind === '新写') {
        m = this.fresh(k)
        this.repeated = 0
      } else if (kind === '再现') {
        m = { start: base.start, rel: [...base.rel], gaps: [...base.gaps] }
        this.repeated += 1
      } else if (kind === '倒影') {
        m = { start: base.start, rel: base.rel.map((d) => -d), gaps: [...base.gaps] }
        this.repeated = 0
      } else if (kind === '截短') {
        m = { start: base.start, rel: base.rel.slice(0, -1), gaps: base.gaps.slice(0, -1) }
        this.repeated = 0
      } else {
        m = {
          start: clamp(base.start + choice(this.rng, [-1, 1]), 0, this.n - 1),
          rel: [...base.rel],
          gaps: [...base.gaps],
        }
        this.repeated = 0
      }
    }

    let ps = this.realize(m)
    // 不和上一句一模一样（Python 参考版靠多渲几个种子挑掉这种情况；实时引擎没法挑，只能在作曲时避开）。
    // 有些音高只有一条录音，「再现」上一句就会完全重复 → 改成平移一级
    if (ps.length === this.lastPhrase.length && ps.every((p, i) => p === this.lastPhrase[i])) {
      for (const dir of [1, -1]) {
        const alt = this.realize({ ...m, start: clamp(m.start + dir, 0, this.n - 1) })
        if (!alt.every((p, i) => p === this.lastPhrase[i])) {
          ps = alt
          if (kind === '再现') kind = '平移'
          break
        }
      }
    }
    const gaps = m.gaps.slice(0, ps.length - 1)
    // 记住实际弹出来的动机（去重调整之后）
    if (kind === '新写' && ps.length >= 2) {
      this.motif = { start: ps[0], rel: ps.slice(1).map((p, i) => p - ps[i]), gaps: [...gaps] }
    }
    this.lastPitch = ps[ps.length - 1]
    this.lastPhrase = ps
    return { kind, pitches: ps, gaps }
  }

  /** 落成绝对音高：越界就反弹；不连弹同一音（包括和上一句最后一音） */
  private realize(m: Motif): number[] {
    const ps = [m.start]
    for (const d of m.rel) {
      let nx = ps[ps.length - 1] + d
      if (nx < 0 || nx >= this.n) nx = ps[ps.length - 1] - d
      ps.push(clamp(nx, 0, this.n - 1))
    }
    if (ps[0] === this.lastPitch) ps[0] = clamp(ps[0] + (ps[0] < this.n - 1 ? 1 : -1), 0, this.n - 1)
    for (let i = 1; i < ps.length; i++) {
      if (ps[i] === ps[i - 1]) ps[i] = ps[i] + (ps[i] < this.n - 1 ? 1 : -1)
    }
    return ps
  }
}
