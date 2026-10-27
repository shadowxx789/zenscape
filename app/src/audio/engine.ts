/**
 * 当前使用的发声引擎。
 * 默认 v2（真实录音采样，定稿 C++6）；URL 带 ?engine=v1 时回到旧的合成引擎，便于对比。
 */
import { audioEngine as legacyEngine, type RecentEvent } from './AudioEngine'
import type { AudioDiagnostics } from './AudioDiagnostics'
import type { SchedulerParams } from './scheduler'
import type { Mode } from '../types'
import { sampleEngine } from './v2/SampleEngine'

export interface Engine {
  readonly playing: boolean
  readonly diagnostics: AudioDiagnostics | null
  readonly ambientMuted: boolean
  readonly eventsSolo: boolean
  /** true：阶段变化已写进乐谱，界面不要再按阶段改参数 */
  readonly ownsDynamics?: boolean
  prepareSession?(mode: Mode, durationSec: number): void
  play(): Promise<void>
  stop(): void
  stopImmediate(): void
  resumeContext(): void
  setMode(mode: Mode): void
  setMasterVolume(v: number): void
  setNatureLevel(v: number): void
  setInstrumentLevel(v: number): void
  setSpatialLevel(v: number): void
  setBrightness(v: number): void
  setSchedulerParams(p: Partial<SchedulerParams>): void
  muteAmbient(muted: boolean): void
  soloEvents(solo: boolean): void
  getRecentEvents(): RecentEvent[]
  triggerEvent(type: 'temple_bell' | 'guqin_harmonic'): void
}

function pick(): Engine {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('engine') === 'v1') {
    return legacyEngine
  }
  return sampleEngine
}

export const engine: Engine = pick()

if (typeof window !== 'undefined') {
  const w = window as unknown as { audioEngine: Engine; sampleEngine: typeof sampleEngine }
  w.audioEngine = engine
  w.sampleEngine = sampleEngine
}
