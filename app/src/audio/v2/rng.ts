/**
 * 可复现的随机数（mulberry32）。同一个种子 → 同一段声景，方便验收与暂停后续播。
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 从一个种子派生互不相关的子流（事件、纹理、混响各用各的，互不影响时间线） */
export function derive(seed: number, salt: number): Rng {
  return mulberry32((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(salt, 0xc2b2ae35)) >>> 0)
}

export function uniform(r: Rng, a: number, b: number): number {
  return a + (b - a) * r()
}

export function normal(r: Rng, mu = 0, sd = 1): number {
  const u = Math.max(r(), 1e-12)
  const v = r()
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function randInt(r: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(r() * n))
}

export function choice<T>(r: Rng, items: readonly T[], weights?: readonly number[]): T {
  if (!weights) return items[randInt(r, items.length)]
  const total = weights.reduce((s, w) => s + w, 0)
  let x = r() * total
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]
    if (x < 0) return items[i]
  }
  return items[items.length - 1]
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function newSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 2 ** 32)
}
