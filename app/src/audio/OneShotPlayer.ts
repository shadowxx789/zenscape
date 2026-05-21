/**
 * OneShotPlayer — BreezeScape M3 (v3 修复)
 *
 * 核心原则：所有声音从 0 线性渐起，绝不用 exponentialRamp 做 attack。
 * exponentialRamp 只用于 decay（从有到无），不做 attack（从无到有）。
 */

import type { PentatonicScale } from './soundscapes'

type OneShotType = 'temple_bell' | 'guqin_harmonic'

interface OneShotOptions {
  volumeRange?: [number, number]
  panRange?: [number, number]
}

const DEFAULT_OPTIONS: Required<OneShotOptions> = {
  volumeRange: [0.06, 0.18],
  panRange: [-0.5, 0.5],
}

const BELL_PARTIALS = [
  { ratio: 0.500, decay: 16.0, amp: 0.55, attack: 0.40 },
  { ratio: 1.000, decay: 14.0, amp: 1.00, attack: 0.30 },
  { ratio: 2.000, decay: 7.5, amp: 0.42, attack: 0.25 },
  { ratio: 2.760, decay: 4.2, amp: 0.22, attack: 0.20 },
  { ratio: 5.404, decay: 2.5, amp: 0.10, attack: 0.15 },
  { ratio: 8.933, decay: 1.4, amp: 0.05, attack: 0.10 },
  { ratio: 13.345, decay: 0.8, amp: 0.025, attack: 0.08 },
]

const BELL_FUNDAMENTAL_RANGE: [number, number] = [115, 150]
const PARTIAL_START_JITTER_MS: [number, number] = [0, 15]

const GUQIN_PARAMS = {
  decay: 0.995,
  lpfCoefficient: 0.35,
  durationSec: 8,
  initialBurstSoftness: 1,
}

const HARMONIC_OVERTONE_PROB = 0.18
const HARMONIC_DELAY_RANGE: [number, number] = [1.3, 2.8]

export class OneShotPlayer {
  private ctx: AudioContext
  private eventBus: GainNode
  private spatialLevel = 0.3
  private instrumentLevel = 0.5
  private scale: PentatonicScale = 'C'

  constructor(ctx: AudioContext, eventBus: GainNode) {
    this.ctx = ctx
    this.eventBus = eventBus
  }

  setSpatialLevel(value: number): void {
    this.spatialLevel = clamp(value)
  }

  setInstrumentLevel(value: number): void {
    this.instrumentLevel = clamp(value)
  }

  setScale(scale: PentatonicScale): void {
    this.scale = scale
  }

  play(type: OneShotType, opts?: OneShotOptions): void {
    const options = { ...DEFAULT_OPTIONS, ...opts }
    const now = this.ctx.currentTime
    const volume = rand(options.volumeRange[0], options.volumeRange[1]) * this.instrumentLevel
    const pan = rand(options.panRange[0], options.panRange[1]) * this.spatialLevel

    if (type === 'temple_bell') {
      this.synthBell(now, volume, pan)
    } else {
      this.synthGuqin(now, volume, pan)
    }
  }

  /**
   * 远寺钟声：
   * 金属钟的壳体模态不是 1:2:3 谐波，而是非谐比例。
   * 这些错开的分音让钟听起来像金属在山谷里衰减，而不是 sine 合唱。
   */
  private synthBell(now: number, volume: number, pan: number): void {
    const ctx = this.ctx
    const fundamental = rand(BELL_FUNDAMENTAL_RANGE[0], BELL_FUNDAMENTAL_RANGE[1])

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan

    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 2200
    lpf.Q.value = 0.4
    lpf.connect(panner)
    panner.connect(this.eventBus)

    for (const partial of BELL_PARTIALS) {
      const startJitter = rand(PARTIAL_START_JITTER_MS[0], PARTIAL_START_JITTER_MS[1]) / 1000
      this.addBellPartial(
        lpf,
        fundamental * partial.ratio,
        volume * partial.amp,
        partial.attack,
        partial.decay,
        now + 0.05 + startJitter,
      )
    }
  }

  /**
   * 古琴拨弦：
   * Karplus-Strong 用短噪声脉冲模拟弦被拨动后的反馈衰减，
   * 比 sine 叠加更接近“弦体先亮、随后木质共鸣留下”的听感。
   */
  private synthGuqin(now: number, volume: number, pan: number): void {
    const freqs = getPentatonicFrequencies(this.scale)
    const baseFreq = freqs[Math.floor(Math.random() * freqs.length)]
    this.playGuqinNote(baseFreq, volume * 0.72, pan, now)

    if (Math.random() < HARMONIC_OVERTONE_PROB) {
      const secondFreq = freqs[Math.floor(Math.random() * freqs.length)]
      const delay = rand(HARMONIC_DELAY_RANGE[0], HARMONIC_DELAY_RANGE[1])
      this.playGuqinNote(secondFreq, volume * 0.34, pan, now + delay)
    }
  }

  /**
   * 钟声分音：
   * - 50ms 启动偏移延续自旧实现，作为 attack ramp 之外的二重 click 防护
   * - 分音自身从 0 线性渐起，再指数衰减
   */
  private addBellPartial(
    dest: AudioNode,
    freq: number,
    amp: number,
    attack: number,
    decay: number,
    startTime: number,
  ): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(amp, startTime + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay)

    osc.connect(gain)
    gain.connect(dest)
    osc.start(startTime)
    osc.stop(startTime + attack + decay + 0.1)
  }

  /**
   * 单个古琴音符：
   * 外层 50ms 线性 attack 兜住 buffer 起点，避免拨弦算法里的瞬态变成 click。
   */
  private playGuqinNote(
    freq: number,
    volume: number,
    pan: number,
    startTime: number,
  ): void {
    const ctx = this.ctx
    const sr = ctx.sampleRate
    const ksBuffer = renderKarplusStrong(
      sr,
      freq,
      GUQIN_PARAMS.durationSec,
      GUQIN_PARAMS.decay,
      GUQIN_PARAMS.lpfCoefficient,
      GUQIN_PARAMS.initialBurstSoftness,
    )

    const audioBuffer = ctx.createBuffer(1, ksBuffer.length, sr)
    audioBuffer.copyToChannel(ksBuffer, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer

    const resonance = ctx.createBiquadFilter()
    resonance.type = 'peaking'
    resonance.frequency.value = 800
    resonance.Q.value = 1.2
    resonance.gain.value = 4

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan

    const gain = ctx.createGain()
    const sourceStart = startTime + 0.05
    gain.gain.setValueAtTime(0, sourceStart)
    gain.gain.linearRampToValueAtTime(volume, sourceStart + 0.05)

    source.connect(resonance)
    resonance.connect(panner)
    panner.connect(gain)
    gain.connect(this.eventBus)
    source.start(sourceStart)
    source.stop(sourceStart + GUQIN_PARAMS.durationSec + 0.1)
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function renderKarplusStrong(
  sampleRate: number,
  frequency: number,
  durationSec: number,
  decay: number,
  lpfCoefficient: number,
  initialBurstSoftness: number,
): Float32Array<ArrayBuffer> {
  const length = Math.floor(sampleRate * durationSec)
  const period = Math.max(2, Math.floor(sampleRate / frequency))
  const out = new Float32Array(length)
  const delayLine = new Float32Array(period)

  for (let i = 0; i < period; i += 1) {
    delayLine[i] = Math.random() * 2 - 1
  }

  for (let pass = 0; pass < initialBurstSoftness; pass += 1) {
    let prev = delayLine[period - 1]
    for (let i = 0; i < period; i += 1) {
      const softened = delayLine[i] * 0.5 + prev * 0.5
      prev = delayLine[i]
      delayLine[i] = softened
    }
  }

  let readIdx = 0
  let lpfState = 0
  for (let i = 0; i < length; i += 1) {
    const current = delayLine[readIdx]
    const nextIdx = (readIdx + 1) % period
    const averaged = (current + delayLine[nextIdx]) * 0.5

    lpfState += (averaged - lpfState) * lpfCoefficient
    delayLine[readIdx] = lpfState * decay
    out[i] = current
    readIdx = nextIdx
  }

  return out
}

function getPentatonicFrequencies(scale: PentatonicScale): number[] {
  const scales: Record<PentatonicScale, number[]> = {
    C: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25],
    D: [293.66, 329.63, 369.99, 440.0, 493.88, 587.33],
    G: [196.0, 220.0, 246.94, 293.66, 329.63, 392.0],
  }
  return scales[scale]
}
