/**
 * rules.ts — BreezeScape M4 会话阶段与规则引擎
 *
 * 根据会话进度、模式、时间段自动计算声音参数。
 * 每 3-5 秒由 SessionView 调用一次，参数平滑推给 AudioEngine。
 *
 * 四个阶段：
 * - entering  (0%-10%)   声音慢慢进入，事件略多，建立仪式感
 * - settling  (10%-35%)  减少事件，稳定自然声
 * - deep      (35%-85%)  最低密度，最大留白
 * - returning (85%-100%) 略微变亮，准备结束
 */

import type { SoundParams } from './soundParams'
import type { SchedulerParams } from './scheduler'
import { getModePreset } from './soundscapes'

// — 阶段定义 —

export type Phase = 'entering' | 'settling' | 'deep' | 'returning'

export function getPhase(progress: number): Phase {
  if (progress < 0.10) return 'entering'
  if (progress < 0.35) return 'settling'
  if (progress < 0.85) return 'deep'
  return 'returning'
}

// — 模式基础参数 —

interface RulePreset {
  phaseModifiers: Record<Phase, Partial<SoundParams>>
}

const RULE_PRESETS: Record<string, RulePreset> = {
  meditate: {
    phaseModifiers: {
      entering:  { natureLevel: +0.08, brightness: +0.05, instrumentLevel: +0.04 },
      settling:  { natureLevel: +0.03, brightness: -0.02 },
      deep:      { natureLevel: -0.08, brightness: -0.10, instrumentLevel: -0.12, spatialLevel: +0.04 },
      returning: { natureLevel: -0.02, brightness: +0.07, instrumentLevel: +0.03 },
    },
  },
  sleep: {
    phaseModifiers: {
      entering:  { natureLevel: +0.05, brightness: +0.02 },
      settling:  { natureLevel: +0.02, brightness: -0.05, instrumentLevel: -0.04 },
      deep:      { natureLevel: -0.10, brightness: -0.12, instrumentLevel: -0.08, masterVolume: -0.04 },
      returning: { natureLevel: -0.08, brightness: -0.08, instrumentLevel: -0.08, masterVolume: -0.06 },
    },
  },
  focus: {
    phaseModifiers: {
      entering:  { natureLevel: +0.04, brightness: +0.04 },
      settling:  { natureLevel: +0.02 },
      deep:      { natureLevel: -0.02, brightness: -0.05, instrumentLevel: -0.07 },
      returning: { natureLevel: +0.03, brightness: +0.08, instrumentLevel: +0.02 },
    },
  },
}

// — 时间段调节 —

function getTimeModifier(hour: number): Partial<SoundParams> {
  // 深夜 (22-5)：更暗、更安静
  if (hour >= 22 || hour < 5) {
    return { brightness: -0.15, masterVolume: -0.1 }
  }
  // 清晨 (5-8)：稍微亮一点
  if (hour >= 5 && hour < 8) {
    return { brightness: +0.05 }
  }
  // 白天：无调节
  return {}
}

// — 主入口 —

interface RulesOutput {
  soundParams: SoundParams
  schedulerParams: SchedulerParams
}

/**
 * 根据当前状态计算最终的 sound params 和 scheduler params。
 *
 * @param mode - 当前模式
 * @param progress - 会话进度 (0-1)
 * @param userOverrides - 用户手动调的滑杆值（优先级最高）
 * @param hour - 当前小时 (0-23)
 */
export function computeParams(
  mode: string,
  progress: number,
  userOverrides: Partial<SoundParams>,
  hour: number,
): RulesOutput {
  const preset = getModePreset(mode)
  const rules = RULE_PRESETS[mode] ?? RULE_PRESETS.meditate
  const phase = getPhase(progress)

  const phaseMod = rules.phaseModifiers[phase]

  // 时间段修饰
  const timeMod = getTimeModifier(hour)

  // 合并：基础 + 阶段修饰 + 时间修饰 + 用户覆盖
  const soundParams: SoundParams = {
    masterVolume:    mergeParam(preset.sound.masterVolume,    phaseMod.masterVolume,    timeMod.masterVolume,    userOverrides.masterVolume),
    natureLevel:     mergeParam(preset.sound.natureLevel,     phaseMod.natureLevel,     timeMod.natureLevel,     userOverrides.natureLevel),
    instrumentLevel: mergeParam(preset.sound.instrumentLevel, phaseMod.instrumentLevel, timeMod.instrumentLevel, userOverrides.instrumentLevel),
    spatialLevel:    mergeParam(preset.sound.spatialLevel,    phaseMod.spatialLevel,    timeMod.spatialLevel,    userOverrides.spatialLevel),
    brightness:      mergeParam(preset.sound.brightness,      phaseMod.brightness,      timeMod.brightness,      userOverrides.brightness),
  }

  // 调度器参数也随阶段变化
  const densityMod = phase === 'deep' ? 0.28 : phase === 'entering' ? 1.08 : phase === 'returning' ? 0.72 : 0.82
  const eventMod = phase === 'deep' ? 0.5 : phase === 'entering' ? 1.0 : phase === 'returning' ? 0.62 : 0.78
  const schedulerParams: SchedulerParams = {
    ...preset.scheduler,
    density: clamp(preset.scheduler.density * densityMod),
    bellProbability: preset.scheduler.bellProbability * eventMod,
    pluckProbability: preset.scheduler.pluckProbability * eventMod,
    minEventGap: Math.round((preset.scheduler.minEventGap ?? 24) * (phase === 'deep' ? 1.4 : 1)),
  }

  return { soundParams, schedulerParams }
}

function mergeParam(base: number, phase = 0, time = 0, user?: number): number {
  if (typeof user === 'number') return clamp(user)
  return clamp(base + phase + time)
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}
