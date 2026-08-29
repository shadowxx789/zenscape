import type { Mode } from '../types'
import type { SoundParams } from './soundParams'
import type { SchedulerParams } from './scheduler'

export type PentatonicScale = 'C' | 'D' | 'G'

export type EnginePreset = {
  windGain: number
  waterGain: number
  droneGain: number
  droneFrequency: number
  droneFilter: number
  windFilter: number
  waterFilter: number
  waterClarity: number
  windPan: number
  waterPan: number
  reverbWet: number
  scale: PentatonicScale
}

export type ModePreset = {
  sound: SoundParams
  scheduler: SchedulerParams
  engine: EnginePreset
}

export const MODE_PRESETS: Record<Mode, ModePreset> = {
  meditate: {
    sound: {
      masterVolume: 0.48,
      natureLevel: 0.62,
      instrumentLevel: 0.42,
      spatialLevel: 0.44,
      brightness: 0.44,
      waterClarity: 0.35,
    },
    scheduler: {
      density: 0.32,
      bellProbability: 0.58,
      pluckProbability: 0.42,
      minEventGap: 24,
      bellMinGap: 85,
      pluckMinGap: 52,
      firstEventDelay: 18,
    },
    engine: {
      windGain: 0.26,
      waterGain: 0.18,
      droneGain: 0.01,
      droneFrequency: 55,
      droneFilter: 135,
      windFilter: 560,
      waterFilter: 700,
      waterClarity: 0.35,
      windPan: -0.26,
      waterPan: 0.2,
      reverbWet: 0.45,
      scale: 'C',
    },
  },
  sleep: {
    sound: {
      masterVolume: 0.36,
      natureLevel: 0.56,
      instrumentLevel: 0.22,
      spatialLevel: 0.54,
      brightness: 0.22,
      waterClarity: 0.15,
    },
    scheduler: {
      density: 0.18,
      bellProbability: 0.75,
      pluckProbability: 0.25,
      minEventGap: 42,
      bellMinGap: 150,
      pluckMinGap: 120,
      firstEventDelay: 45,
    },
    engine: {
      windGain: 0.20,
      waterGain: 0.24,
      droneGain: 0.01,
      droneFrequency: 49,
      droneFilter: 105,
      windFilter: 420,
      waterFilter: 550,
      waterClarity: 0.15,
      windPan: -0.18,
      waterPan: 0.3,
      reverbWet: 0.65,
      scale: 'G',
    },
  },
  focus: {
    sound: {
      masterVolume: 0.46,
      natureLevel: 0.54,
      instrumentLevel: 0.30,
      spatialLevel: 0.28,
      brightness: 0.58,
      waterClarity: 0.60,
    },
    scheduler: {
      density: 0.26,
      bellProbability: 0.56,
      pluckProbability: 0.44,
      minEventGap: 34,
      bellMinGap: 120,
      pluckMinGap: 64,
      firstEventDelay: 28,
    },
    engine: {
      windGain: 0.15,
      waterGain: 0.3,
      droneGain: 0.01,
      droneFrequency: 73,
      droneFilter: 160,
      windFilter: 720,
      waterFilter: 900,
      waterClarity: 0.60,
      windPan: -0.12,
      waterPan: 0.16,
      reverbWet: 0.25,
      scale: 'D',
    },
  },
}

export function getModePreset(mode: Mode | string): ModePreset {
  return MODE_PRESETS[mode as Mode] ?? MODE_PRESETS.meditate
}
