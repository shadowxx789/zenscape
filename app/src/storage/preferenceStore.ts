/**
 * preferenceStore.ts
 *
 * 读写用户偏好到 localStorage：模式、时长、声音疏密。
 * 旧版存过的五个滑杆值（soundParams）读到后直接忽略。
 */

import type { Density } from '../audio/engine'
import type { Mode } from '../types'
import type { DurationMinutes } from '../components/duration'
import { DEFAULT_DURATION } from '../components/duration'

const STORAGE_KEY = 'zenscape:prefs'

export interface Preferences {
  mode: Mode
  duration: DurationMinutes
  density: Density
}

export const DEFAULT_PREFS: Preferences = {
  mode: 'meditate',
  duration: DEFAULT_DURATION,
  density: 'mid',
}

const VALID_MODES: Mode[] = ['meditate', 'sleep', 'focus']
const VALID_DENSITIES: Density[] = ['sparse', 'mid', 'full']

function isValidMode(m: unknown): m is Mode {
  return typeof m === 'string' && VALID_MODES.includes(m as Mode)
}

function isValidDensity(d: unknown): d is Density {
  return typeof d === 'string' && VALID_DENSITIES.includes(d as Density)
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    return {
      mode: isValidMode(parsed.mode) ? parsed.mode : DEFAULT_PREFS.mode,
      duration:
        typeof parsed.duration === 'number' && parsed.duration > 0 && parsed.duration <= 180
          ? parsed.duration
          : DEFAULT_PREFS.duration,
      density: isValidDensity(parsed.density) ? parsed.density : DEFAULT_PREFS.density,
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
  const prefs = { ...DEFAULT_PREFS }
  savePreferences(prefs)
  return prefs
}
