/**
 * 声景参数。meditate = Eric 定稿的 C++6（ab-demo/render_r8.py Cpp6，参考文件 ZenScape_R8_Cpp6_s64.mp3）。
 * sleep / focus 是按「同一片竹林的不同时刻」做的推断，尚未经过试听定稿。
 */
import type { Mode } from '../../types'

export type PhaseKey = 'enter' | 'settle' | 'deep' | 'return'
export type Range = readonly [number, number]

export interface V2Preset {
  /** 风歇（风＋水一起退） */
  breath: {
    depthDb: number
    lull: Range
    ramp: Range
    gap: Range
    first: Range
    /** 水退的幅度 = 风的 waterExp 倍 */
    waterExp: number
    /** 水最多退到这里（dB），山涧不会停 */
    waterFloorDb: number
    /** 风歇里的余息（±dB/2） */
    murmurDb: number
    /** 风回来比退下去慢几倍 */
    upMult: number
  }
  /** 风歇里的深静小窝 */
  pockets: { depthDb: number; hold: Range; dn: Range; up: Range; prob: number }
  qin: {
    gap: Range
    noteWeights: Record<PhaseKey, readonly [number, number, number]>
    phaseGainDb: Record<PhaseKey, number>
    /** 古琴头部比「此刻的底」高多少（手机模拟 dB） */
    overLocalDb: number
    /** 此刻的底最低按「全场底 - 12dB」算，避免风歇时琴太轻 */
    localFloorBelowBedDb: number
    far: { airLp: Range; rt60: Range; wet: number; dry: number; predelay: number; lp: number }
  }
  bell: {
    every: number
    jitter: number
    overBedDb: number
    /** 可选：钟头部至少比「此刻的底（前 5s）」高多少，防止落在风满处被盖住 */
    overLocalMinDb?: number
    far: { lp: Range; rt60: Range; wet: number; dry: number; predelay: number; rlp: number; headDb: number }
  }
  waterDb: number
  /** 种子筛选：明显安静占比下限（planIssues）。缺省 = 中档 135/295 */
  quietMin?: number
}

const MEDITATE: V2Preset = {
  breath: {
    depthDb: -15,
    lull: [35, 80],
    ramp: [6, 10],
    gap: [12, 25],
    first: [26, 36],
    waterExp: 0.55,
    waterFloorDb: -8,
    murmurDb: 3,
    upMult: 2.5,
  },
  pockets: { depthDb: -9, hold: [2.8, 3.6], dn: [2.0, 2.5], up: [6.0, 7.0], prob: 0.85 },
  qin: {
    gap: [70, 140],
    noteWeights: { enter: [0.8, 0.2, 0], settle: [0.5, 0.5, 0], deep: [0.7, 0.3, 0], return: [1, 0, 0] },
    phaseGainDb: { enter: 0, settle: 0, deep: -2.5, return: -1 },
    overLocalDb: 10,
    localFloorBelowBedDb: 12,
    far: { airLp: [2200, 2800], rt60: [6.5, 8.0], wet: 0.85, dry: 0.4, predelay: 0.09, lp: 3000 },
  },
  bell: {
    every: 180,
    jitter: 15,
    overBedDb: 14,
    far: { lp: [2100, 2800], rt60: [7.0, 8.0], wet: 0.75, dry: 0.45, predelay: 0.12, rlp: 2600, headDb: -1 },
  },
  waterDb: 0,
}

export const V2_PRESETS: Record<Mode, V2Preset> = {
  meditate: MEDITATE,
  // 入睡：深夜，更稀（未试听）
  sleep: {
    ...MEDITATE,
    qin: {
      ...MEDITATE.qin,
      gap: [90, 170],
      noteWeights: { enter: [1, 0, 0], settle: [0.8, 0.2, 0], deep: [1, 0, 0], return: [1, 0, 0] },
    },
    bell: { ...MEDITATE.bell, every: 240 },
  },
  // 专注：午后，水稍亮（未试听）
  focus: { ...MEDITATE, waterDb: 2 },
}

/** 疏密三档：开始前选，播放中不改。mid = 定稿 C++6 */
export type Density = 'sparse' | 'mid' | 'full'

/** 试听草案（未定稿）：只动风歇节奏、深静、古琴间隔；钟、远近、音色不变 */
const DENSITY_TWEAK: Record<Density, (p: V2Preset) => V2Preset> = {
  mid: (p) => p,
  // 疏（v2，拉大差距）：风歇长且深、水退得更低、深静每次都有且更久、古琴更稀且只单音
  sparse: (p) => ({
    ...p,
    breath: { ...p.breath, depthDb: p.breath.depthDb - 3, lull: [60, 110], gap: [10, 18], waterFloorDb: p.breath.waterFloorDb - 2 },
    pockets: { ...p.pockets, prob: 1 },
    qin: {
      ...p.qin,
      gap: [110, 190],
      noteWeights: { enter: [1, 0, 0], settle: [1, 0, 0], deep: [1, 0, 0], return: [1, 0, 0] },
    },
    bell: { ...p.bell, overLocalMinDb: 11 },
    quietMin: 0.62,
  }),
  // 满（v3）：一直有声音——风歇短而浅（只是轻一点，不静）、水几乎不退、不留深静；古琴更勤且常两三声成句
  full: (p) => ({
    ...p,
    breath: { ...p.breath, depthDb: -6, lull: [18, 35], gap: [18, 32], waterExp: 0.4, waterFloorDb: -3 },
    pockets: { ...p.pockets, prob: 0 },
    qin: {
      ...p.qin,
      gap: [45, 85],
      noteWeights: { enter: [0.6, 0.4, 0], settle: [0.3, 0.5, 0.2], deep: [0.4, 0.5, 0.1], return: [0.8, 0.2, 0] },
    },
    bell: { ...p.bell, overLocalMinDb: 11 },
    quietMin: 0,
  }),
}

export function presetFor(mode: Mode, density: Density = 'mid'): V2Preset {
  return DENSITY_TWEAK[density](V2_PRESETS[mode])
}

export function phaseOf(progress: number): PhaseKey {
  if (progress < 0.1) return 'enter'
  if (progress < 0.35) return 'settle'
  if (progress < 0.85) return 'deep'
  return 'return'
}
