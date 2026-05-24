/**
 * Scheduler — BreezeScape M3
 *
 * 概率事件调度器：
 * - 每 TICK_INTERVAL 秒检查一次
 * - density 决定本次 tick 是否触发任意事件
 * - probability 字段作为候选事件的相对选择权重
 * - 支持最小事件间隔（避免太密集）
 * - 暂停时停止，恢复时继续
 */

import { OneShotPlayer } from './OneShotPlayer'

export type EventType = 'temple_bell' | 'guqin_harmonic'

export interface SchedulerParams {
  /** 总体密度 (0-1)，控制 tick 中尝试触发任意事件的概率 */
  density: number
  /** 钟声选择权重；总事件频率由 density 控制 */
  bellProbability: number
  /** 古琴选择权重；总事件频率由 density 控制 */
  pluckProbability: number
  /** 任意两个事件之间的最小间隔（秒） */
  minEventGap?: number
  /** 钟声之间的最小间隔（秒） */
  bellMinGap?: number
  /** 古琴之间的最小间隔（秒） */
  pluckMinGap?: number
  /** 开始播放后多久才允许第一次事件（秒） */
  firstEventDelay?: number
}

const TICK_MIN = 6 // 秒
const TICK_MAX = 13 // 秒
const MIN_EVENT_GAP = 24 // 两个事件之间最少间隔（秒）

export const DEFAULT_SCHEDULER_PARAMS: SchedulerParams = {
  density: 0.3,
  bellProbability: 0.025,
  pluckProbability: 0.04,
  minEventGap: MIN_EVENT_GAP,
  bellMinGap: 85,
  pluckMinGap: 55,
  firstEventDelay: 18,
}

type WeightedEvent = {
  type: EventType
  weight: number
}

export class Scheduler {
  private player: OneShotPlayer
  private timer: ReturnType<typeof setTimeout> | null = null
  private startedAt = 0
  private lastEventTime = 0
  private lastByType: Record<EventType, number> = {
    temple_bell: 0,
    guqin_harmonic: 0,
  }
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
    const now = Date.now() / 1000
    this.startedAt = now
    this.lastEventTime = now
    this.lastByType.temple_bell = now
    this.lastByType.guqin_harmonic = now
    this.scheduleNext(this.params.firstEventDelay ?? DEFAULT_SCHEDULER_PARAMS.firstEventDelay!)
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** 是否正在运行 */
  get running(): boolean {
    return this.timer !== null
  }

  private tick(): void {
    const now = Date.now() / 1000
    const age = now - this.startedAt

    // 最小间隔检查
    if (age < (this.params.firstEventDelay ?? 0)) {
      this.scheduleNext()
      return
    }
    if (now - this.lastEventTime < (this.params.minEventGap ?? MIN_EVENT_GAP)) {
      this.scheduleNext()
      return
    }

    // density 是总闸门；通过后再在满足 minGap 的候选事件中按权重选择。
    if (Math.random() > this.params.density) {
      this.scheduleNext()
      return
    }

    const event = this.pickEvent(now)
    if (event) {
      this.player.play(event)
      this.lastEventTime = now
      this.lastByType[event] = now
    }

    this.scheduleNext()
  }

  private pickEvent(now: number): EventType | null {
    const candidates: WeightedEvent[] = []

    if (
      this.params.bellProbability > 0 &&
      now - this.lastByType.temple_bell >= (this.params.bellMinGap ?? 85)
    ) {
      candidates.push({ type: 'temple_bell', weight: this.params.bellProbability })
    }

    if (
      this.params.pluckProbability > 0 &&
      now - this.lastByType.guqin_harmonic >= (this.params.pluckMinGap ?? 55)
    ) {
      candidates.push({ type: 'guqin_harmonic', weight: this.params.pluckProbability })
    }

    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
    if (totalWeight <= 0) return null

    let pick = Math.random() * totalWeight
    for (const candidate of candidates) {
      pick -= candidate.weight
      if (pick <= 0) return candidate.type
    }

    return candidates[candidates.length - 1]?.type ?? null
  }

  private scheduleNext(delaySeconds = rand(TICK_MIN, TICK_MAX)): void {
    this.stop()
    this.timer = setTimeout(() => this.tick(), delaySeconds * 1000)
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
