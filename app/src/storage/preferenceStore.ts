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

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    return {
      mode: typeof parsed.mode === 'string' ? parsed.mode : DEFAULT_PREFS.mode,
      duration: typeof parsed.duration === 'number' ? parsed.duration : DEFAULT_PREFS.duration,
      soundParams: {
        masterVolume:    typeof parsed.soundParams?.masterVolume === 'number'    ? parsed.soundParams.masterVolume    : DEFAULT_PARAMS.masterVolume,
        natureLevel:     typeof parsed.soundParams?.natureLevel === 'number'     ? parsed.soundParams.natureLevel     : DEFAULT_PARAMS.natureLevel,
        instrumentLevel: typeof parsed.soundParams?.instrumentLevel === 'number' ? parsed.soundParams.instrumentLevel : DEFAULT_PARAMS.instrumentLevel,
        spatialLevel:    typeof parsed.soundParams?.spatialLevel === 'number'    ? parsed.soundParams.spatialLevel    : DEFAULT_PARAMS.spatialLevel,
        brightness:      typeof parsed.soundParams?.brightness === 'number'      ? parsed.soundParams.brightness      : DEFAULT_PARAMS.brightness,
      },
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
