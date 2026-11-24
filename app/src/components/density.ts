import type { Density } from '../audio/engine'

/** 疏 / 中 / 满：开始前选，播放中不改（引擎侧 presetFor 决定具体疏密） */
export const DENSITIES: Density[] = ['sparse', 'mid', 'full']
