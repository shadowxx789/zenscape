/**
 * preferenceStore.ts — BreezeScape M5
 *
 * 读写用户偏好到 localStorage。
 * 保存：模式、时长、五个滑杆值。
 */

import type { SoundParams } from '../audio/soundParams'
import { DEFAULT_PARAMS } from '../audio/soundParams'
import type { Mode } from '../types'
import type { DurationMinutes } from '../components/duration'
import { DEFAULT_DURATION } from '../components/duration'

const STORAGE_KEY = 'zenscape:prefs'

export interface Preferences {
  mode: Mode
  duration: DurationMinutes
  soundParams: SoundParams
}

export const DEFAULT_PREFS: Preferences = {
  mode: 'meditate',
  duration: DEFAULT_DURATION,
  soundParams: { ...DEFAULT_PARAMS },
}

const VALID_MODES: Mode[] = ['meditate', 'sleep', 'focus']

function isValidMode(m: unknown): m is Mode {
  return typeof m === 'string' && VALID_MODES.includes(m as Mode)
}

function validateParam(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || isNaN(v)) return fallback
  return Math.max(0, Math.min(1, v))
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)

    const soundParams = { ...DEFAULT_PARAMS }
    if (parsed.soundParams && typeof parsed.soundParams === 'object') {
      for (const key of Object.keys(DEFAULT_PARAMS) as (keyof SoundParams)[]) {
        soundParams[key] = validateParam(parsed.soundParams[key], DEFAULT_PARAMS[key])
      }
    }

    return {
      mode: isValidMode(parsed.mode) ? parsed.mode : DEFAULT_PREFS.mode,
      duration: typeof parsed.duration === 'number' && parsed.duration > 0 ? parsed.duration : DEFAULT_PREFS.duration,
      soundParams,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage 满了或不可用，静默失败
  }
}

export function resetPreferences(): Preferences {
  const prefs = {
    mode: DEFAULT_PREFS.mode,
    duration: DEFAULT_PREFS.duration,
    soundParams: { ...DEFAULT_PREFS.soundParams },
  }
  savePreferences(prefs)
  return prefs
}
