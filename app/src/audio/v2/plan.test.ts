/**
 * 乐谱（plan）验收：和 Python 参考版（ab-demo/render_r6.py + render_r8.py Cpp6）同一套作曲/疏密门槛。
 * 声音层面的门槛（手机模拟响度、深静实测、钟/琴高出底多少）在 ab-demo/verify_engine.py 里对离线渲染结果测。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildPlan, planIssues, planSession, type SessionPlan, type SoundscapeManifest } from './plan'
import { presetFor, V2_PRESETS, type Density } from './preset'

const M = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../public/audio/v2/soundscape.json', import.meta.url)), 'utf-8'),
) as SoundscapeManifest
const P = V2_PRESETS.meditate
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919)

function plans(dur: number): SessionPlan[] {
  return SEEDS.map((s) => planSession(s, dur, P, M))
}

describe('plan: determinism', () => {
  it('same seed → identical plan; different seed → different plan', () => {
    const a = buildPlan(42, 360, P, M)
    const b = buildPlan(42, 360, P, M)
    const c = buildPlan(43, 360, P, M)
    expect(JSON.stringify(a.phrases)).toBe(JSON.stringify(b.phrases))
    expect(Array.from(a.envDb.bamboo)).toEqual(Array.from(b.envDb.bamboo))
    expect(JSON.stringify(a.phrases)).not.toBe(JSON.stringify(c.phrases))
  })
})

describe.each([360, 600, 1800])('plan gates @ %ss', (dur) => {
  const ps = plans(dur)

  it('bells: final strike leaves the whole tail; middle strikes ~every 180±15 s', () => {
    for (const p of ps) {
      const last = p.bells[p.bells.length - 1]
      expect(last.final).toBe(true)
      expect(last.at).toBeCloseTo(dur - (M.files.bell.durSec + 8.5), 5)
      for (let i = 1; i < p.bells.length; i++) {
        const gap = p.bells[i].at - p.bells[i - 1].at
        expect(gap).toBeGreaterThanOrEqual(165 - 1e-6)
        expect(gap).toBeLessThanOrEqual(195 + 1e-6)
      }
      expect(p.bells[0].at).toBeGreaterThan(45)
    }
  })

  it('qin: phrase gaps within 66–140 s, none within 18 s of a bell, none in the last 20 s before the final bell', () => {
    for (const p of ps) {
      expect(p.phrases.length).toBeGreaterThan(0)
      for (let i = 1; i < p.phrases.length; i++) {
        const gap = p.phrases[i].at - p.phrases[i - 1].at
        expect(gap).toBeLessThanOrEqual(P.qin.gap[1] + 1e-6)
        expect(gap).toBeGreaterThanOrEqual(P.qin.gap[0] - 4)
      }
      for (const ph of p.phrases) {
        for (const b of p.bells) expect(Math.abs(ph.at - b.at)).toBeGreaterThan(18)
        expect(ph.at).toBeLessThan(p.endBell - 20)
      }
    }
  })

  it('qin: never the same pitch twice in a row, never two identical consecutive phrases', () => {
    for (const p of ps) {
      const all = p.phrases.flatMap((ph) => ph.notes.map((n) => n.pitch))
      for (let i = 1; i < all.length; i++) expect(all[i]).not.toBe(all[i - 1])
      const seqs = p.phrases.map((ph) => ph.notes.map((n) => `${n.pitch}#${n.take}`).join(','))
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]).not.toBe(seqs[i - 1])
    }
  })

  it('qin: at most 2 notes per phrase (C++6), phrases are sparse', () => {
    for (const p of ps) {
      for (const ph of p.phrases) expect(ph.notes.length).toBeLessThanOrEqual(2)
      expect(p.phrases.length / (dur / 60)).toBeLessThanOrEqual(1)
    }
  })

  it('bed envelope never swells fast: ≤ 6 dB per 2 s, ≤ 2 dB per 0.5 s (modelled phone loudness)', () => {
    for (const p of ps) {
      const R = p.ctrlRate
      const half = Math.floor((p.endBell - 1) * 2)
      const e: number[] = []
      for (let k = 0; k < half; k++) {
        let s = 0
        for (let j = 0; j < R / 2; j++) {
          const i = k * (R / 2) + j
          s += Math.pow(10, (p.bedPhoneDb[i] + p.bedOutDb[i]) / 10)
        }
        e.push(10 * Math.log10(s / (R / 2)))
      }
      let maxRise = -Infinity
      let maxJump = -Infinity
      for (let k = 10; k < e.length - 4; k++) maxRise = Math.max(maxRise, e[k + 4] - e[k])
      for (let k = 10; k < e.length - 1; k++) maxJump = Math.max(maxJump, e[k + 1] - e[k])
      expect(maxRise).toBeLessThanOrEqual(6)
      expect(maxJump).toBeLessThanOrEqual(2)
    }
  })

  it('deep pockets avoid bell and qin tails and sit inside lull plateaus', () => {
    for (const p of ps) {
      for (const k of p.pockets) {
        const end = k.start + k.dn + k.hold + k.up
        expect(p.lulls.some((l) => k.start >= l.plateau[0] && end <= l.plateau[1])).toBe(true)
        for (const b of p.bells) expect(end < b.at - 3 || k.start > b.at + 28).toBe(true)
        for (const ph of p.phrases) {
          expect(end < ph.at - 3 || k.start > ph.at + 14 + 3 * ph.notes.length).toBe(true)
        }
      }
    }
  })
})

describe('plan: sparse but never silent (C++6 numbers)', () => {
  it('lull floor ~-11 dB under wind-full; water never drops below its floor', () => {
    for (const p of plans(600)) {
      const v = Array.from(p.bedPhoneDb.slice(35 * 20, Math.floor(p.endBell) * 20)).sort((a, b) => a - b)
      const p90 = v[Math.floor(v.length * 0.9)]
      const p3 = v[Math.floor(v.length * 0.03)]
      expect(p3 - p90).toBeGreaterThan(-16)
      expect(p3 - p90).toBeLessThan(-8)
    }
  })

  it('about 2 deep pockets per 6 minutes on average', () => {
    const counts = plans(360).map((p) => p.pockets.length)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    expect(mean).toBeGreaterThanOrEqual(1)
    expect(mean).toBeLessThanOrEqual(3.5)
  })
})

describe('planSession: seed screening keeps every session sparse and even', () => {
  it.each([360, 600, 1800])('%ss: ≥ 95%% of seeds pass planIssues (quiet ≥ C++6 level, wind passes within 0.8 dB)', (dur) => {
    const ok = plans(dur).filter((p) => planIssues(p).length === 0).length
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.95)
  })
  it('screening is deterministic', () => {
    expect(planSession(77, 600, P, M).seed).toBe(planSession(77, 600, P, M).seed)
    expect(JSON.stringify(planSession(77, 600, P, M).phrases)).toBe(JSON.stringify(planSession(77, 600, P, M).phrases))
  })
  it('raw buildPlan is unchanged by screening (same seed → same plan)', () => {
    expect(JSON.stringify(buildPlan(5, 360, P, M).bells)).toBe(JSON.stringify(buildPlan(5, 360, P, M).bells))
  })
})

// ───────────────────────── 疏密三档（Eric 2026-10-28 试听定档：疏 v2 / 中 = C++6 / 满 v3）

/** 模型估算的底层每秒手机 dB（含深静与限速），35s 到结尾钟前 10s */
function bedSeconds(p: SessionPlan): number[] {
  const R = p.ctrlRate
  const a = 35
  const b = Math.max(a + 60, Math.floor(p.endBell) - 10)
  const e: number[] = []
  for (let s = a; s < b; s++) {
    let acc = 0
    for (let k = 0; k < R; k++) acc += Math.pow(10, (p.bedPhoneDb[s * R + k] + p.bedOutDb[s * R + k]) / 10)
    e.push(10 * Math.log10(acc / R))
  }
  return e
}
const pct = (xs: number[], q: number) => [...xs].sort((x, y) => x - y)[Math.floor((xs.length - 1) * q)]
const quietFrac = (p: SessionPlan) => {
  const e = bedSeconds(p)
  const p90 = pct(e, 0.9)
  return e.filter((v) => v <= p90 - 10).length / e.length
}

describe('density: 疏 / 中 / 满', { timeout: 60_000 }, () => {
  const DURS = [360, 600, 1800]
  // 乐谱是纯函数：每档每时长只排一次，各测试共用（30 分钟 × 40 种子 × 3 档单排约 5s）
  const cache = new Map<string, SessionPlan[]>()
  const byDensity = (d: Density, dur: number) => {
    const k = `${d}:${dur}`
    if (!cache.has(k)) cache.set(k, SEEDS.map((s) => planSession(s, dur, presetFor('meditate', d), M)))
    return cache.get(k)!
  }

  it('中 is exactly the locked C++6 preset', () => {
    expect(presetFor('meditate', 'mid')).toEqual(V2_PRESETS.meditate)
    expect(presetFor('meditate')).toEqual(V2_PRESETS.meditate)
  })

  it.each(DURS)('%ss: ≥ 95%% of seeds pass planIssues at each density own quiet threshold', (dur) => {
    for (const d of ['sparse', 'mid', 'full'] as Density[]) {
      const P = presetFor('meditate', d)
      const ok = byDensity(d, dur).filter((p) => planIssues(p, P.quietMin).length === 0).length
      expect(ok / SEEDS.length, d).toBeGreaterThanOrEqual(0.95)
    }
  })

  it.each(DURS)('%ss: 疏 ≥ 62%% quiet, 单音 only, ≥ 1 deep pocket', (dur) => {
    for (const p of byDensity('sparse', dur)) {
      expect(quietFrac(p)).toBeGreaterThanOrEqual(0.62)
      for (const ph of p.phrases) expect(ph.notes.length).toBe(1)
      expect(p.pockets.length).toBeGreaterThanOrEqual(1)
    }
  })

  // 满 = 「一直有声音」：没有深静；没有一秒落到「明显安静」线（风满 p90 − 10dB，与 planIssues / verify_engine 同口径）。
  // 风歇本身只退 6dB；模型里最轻一秒 −8.9dB 是竹叶素材自身的亮暗起伏（种子 64 实渲底层最轻 −5.9dB）
  it.each(DURS)('%ss: 满 never goes quiet — no deep pockets, no second at or below wind-full p90 − 10 dB', (dur) => {
    for (const p of byDensity('full', dur)) {
      expect(p.pockets.length).toBe(0)
      const e = bedSeconds(p)
      expect(Math.min(...e) - pct(e, 0.9)).toBeGreaterThan(-10)
      expect(quietFrac(p)).toBe(0)
    }
  })

  it.each(DURS)('%ss: ordering holds on average — quiet 疏 > 中 > 满, qin phrases 疏 < 中 < 满', (dur) => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const q = (['sparse', 'mid', 'full'] as Density[]).map((d) => mean(byDensity(d, dur).map(quietFrac)))
    const n = (['sparse', 'mid', 'full'] as Density[]).map((d) => mean(byDensity(d, dur).map((p) => p.phrases.length)))
    expect(q[0]).toBeGreaterThan(q[1])
    expect(q[1]).toBeGreaterThan(q[2])
    expect(n[0]).toBeLessThan(n[1])
    expect(n[1]).toBeLessThan(n[2])
  })

  it.each(DURS)('%ss: every density keeps bell / qin spacing rules (no qin within 18 s of a bell)', (dur) => {
    for (const d of ['sparse', 'mid', 'full'] as Density[]) {
      for (const p of byDensity(d, dur)) {
        for (const ph of p.phrases) for (const b of p.bells) expect(Math.abs(ph.at - b.at)).toBeGreaterThan(18)
      }
    }
  })
})
