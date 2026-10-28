import type { Density } from '../audio/engine'

/** 疏 / 中 / 满：开始前选，播放中不改（引擎侧 presetFor 决定具体疏密） */
export const DENSITY_DETAILS: Record<Density, { label: string; short: string; description: string }> = {
  sparse: {
    label: '疏',
    short: '大段留白',
    description: '大段留白，风常歇，琴只偶尔一声。',
  },
  mid: {
    label: '中',
    short: '风静各半',
    description: '风与静各半，琴声隔一会儿来一句。',
  },
  full: {
    label: '满',
    short: '声音常在',
    description: '一直有声音，风不大停，琴句更勤。',
  },
}

export const DENSITIES: Density[] = ['sparse', 'mid', 'full']
