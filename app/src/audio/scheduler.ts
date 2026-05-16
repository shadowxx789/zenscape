/**
 * Scheduler — ZenScape M3
 *
 * 概率事件调度器：
 * - 每 TICK_INTERVAL 秒检查一次
 * - 基于 probability 决定是否触发事件
 * - 支持最小事件间隔（避免太密集）
 * - density 参数控制整体事件频率
 * - 暂停时停止，恢复时继续
 */

import { OneShotPlayer } from './OneShotPlayer'

export type EventType = 'temple_bell' | 'guqin_harmonic'

export interface SchedulerParams {
  /** 总体密度 (0-1)，影响 tick 间隔的检查概率 */
  density: number
  /** 钟声触发概率 (0-0.12) */
  bellProbability: number
  /** 古琴触发概率 (0-0.18) */
  pluckProbability: number
}

const TICK_INTERVAL = 5 // 秒
const MIN_EVENT_GAP = 8 // 两个事件之间最少间隔（秒）

export const DEFAULT_SCHEDULER_PARAMS: SchedulerParams = {
  density: 0.5,
  bellProbability: 0.06,
  pluckProbability: 0.10,
}

export class Scheduler {
  private player: OneShotPlayer
  private timer: ReturnType<typeof setInterval> | null = null
  private lastEventTime = 0
  private params: SchedulerParams = { ...DEFAULT_SCHEDULER_PARAMS }

  constructor(player: OneShotPlayer) {
    this.player = player
  }

  /** 更新调度参数（可实时调用） */
  setParams(params: Partial<SchedulerParams>): void {
    this.params = { ...this.params, ...params }
  }

  /** 启动调度 */
  start(): void {
    if (this.timer) return
    this.lastEventTime = 0 // 重置，允许立即触发一次

    this.timer = setInterval(() => {
      this.tick()
    }, TICK_INTERVAL * 1000)

    // 立即做一次 tick（但概率较低，避免开场就响）
    // 等 2 秒后再第一次 tick，给连续声音一点时间稳定
    setTimeout(() => {
      if (this.timer) this.tick()
    }, 2000)
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 是否正在运行 */
  get running(): boolean {
    return this.timer !== null
  }

  private tick(): void {
    const now = Date.now() / 1000

    // 最小间隔检查
    if (now - this.lastEventTime < MIN_EVENT_GAP) return

    // density 影响整体触发意愿
    if (Math.random() > this.params.density) return

    // 逐个事件类型判断
    const roll = Math.random()

    // 钟声
    if (roll < this.params.bellProbability) {
      this.player.play('temple_bell')
      this.lastEventTime = now
      return
    }

    // 古琴
    if (roll < this.params.bellProbability + this.params.pluckProbability) {
      this.player.play('guqin_harmonic')
      this.lastEventTime = now
    }
  }
}
