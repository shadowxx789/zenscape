/**
 * AudioEngine — ZenScape
 *
 * 多层混音 + 概率事件调度：
 * - 风（white noise + bandpass）
 * - 水（white noise + high bandpass）
 * - Drone（低频 oscillator）
 * - 钟声/古琴（OneShotPlayer + Scheduler 概率触发）
 *
 * 信号链：layers → masterGain → fadeGain → destination
 * fadeGain 负责播放/停止的淡入淡出（从 0 到 1）
 * masterGain 负责音量滑杆
 */

import { OneShotPlayer } from './OneShotPlayer'
import { Scheduler, type SchedulerParams } from './scheduler'
import { getModePreset, type EnginePreset } from './soundscapes'
import type { Mode } from '../types'

const FADE_DURATION = 3
const BUFFER_SECONDS = 61
const FADE_IN_TIME = 0.5 // 总线淡入 500ms

// — 层配置 —
interface LayerConfig {
  type: 'noise' | 'oscillator'
  filterFreq: number
  filterQ: number
  filterType: BiquadFilterType
  defaultGain: number
  oscFreq?: number
  oscType?: OscillatorType
}

const LAYER_CONFIGS: Record<string, LayerConfig> = {
  wind: {
    type: 'noise',
    filterFreq: 560,
    filterQ: 0.8,
    filterType: 'bandpass',
    defaultGain: 0.35,
  },
  water: {
    type: 'noise',
    filterFreq: 1900,
    filterQ: 0.5,
    filterType: 'bandpass',
    defaultGain: 0.2,
  },
  drone: {
    type: 'oscillator',
    filterFreq: 135,
    filterQ: 0.45,
    filterType: 'lowpass',
    defaultGain: 0.25,
    oscFreq: 55,
    oscType: 'sine',
  },
}

interface ActiveLayer {
  source: AudioBufferSourceNode | OscillatorNode
  filter: BiquadFilterNode
  panner: StereoPannerNode
  gain: GainNode
  baseGain: number
  baseFilterFreq: number
}

export type LayerName = 'wind' | 'water' | 'drone'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private fadeGain: GainNode | null = null // 总线淡入淡出节点
  private layers: Map<LayerName, ActiveLayer> = new Map()
  private _playing = false
  private _fading = false

  private _noiseBuffers: Partial<Record<'wind' | 'water', AudioBuffer>> = {}
  private evolutionTimer: ReturnType<typeof setTimeout> | null = null

  // 一次性事件（M3）
  private oneShotPlayer: OneShotPlayer | null = null
  private scheduler: Scheduler | null = null
  private preset: EnginePreset = getModePreset('meditate').engine

  // 参数
  private _masterVolume = 0.6
  private _brightness = 0.5
  private _natureLevel = 0.7
  private _instrumentLevel = 0.5
  private _spatialLevel = 0.3

  get playing() { return this._playing }

  setMode(mode: Mode): void {
    this.preset = getModePreset(mode).engine
    this.oneShotPlayer?.setScale(this.preset.scale)

    if (!this.ctx) return
    this.applyLayerGain('wind', this.getLayerGain('wind'))
    this.applyLayerGain('water', this.getLayerGain('water'))
    this.applyLayerGain('drone', this.getDroneGain())
    this.applyLayerPan('wind')
    this.applyLayerPan('water')
    this.applyLayerPan('drone')
    this.setBrightness(this._brightness)

    const drone = this.layers.get('drone')?.source
    if (drone instanceof OscillatorNode) {
      drone.frequency.setTargetAtTime(this.preset.droneFrequency, this.ctx.currentTime, 1.8)
    }
  }

  init(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()

    // 信号链：layers → masterGain → fadeGain → destination
    this.fadeGain = this.ctx.createGain()
    this.fadeGain.gain.value = 0 // 播放前静音
    this.fadeGain.connect(this.ctx.destination)

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this._masterVolume
    this.masterGain.connect(this.fadeGain)
  }

  private async ensureRunning(): Promise<void> {
    if (!this.ctx) this.init()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
  }

  // — 参数接口 —

  setMasterVolume(value: number): void {
    this._masterVolume = clamp(value)
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this._masterVolume, this.ctx.currentTime, 0.05)
    }
  }

  setNatureLevel(value: number): void {
    this._natureLevel = clamp(value)
    this.applyLayerGain('wind', this.getLayerGain('wind'))
    this.applyLayerGain('water', this.getLayerGain('water'))
  }

  setInstrumentLevel(value: number): void {
    this._instrumentLevel = clamp(value)
    this.applyLayerGain('drone', this.getDroneGain())
    this.oneShotPlayer?.setInstrumentLevel(this._instrumentLevel)
  }

  setBrightness(value: number): void {
    this._brightness = clamp(value)
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const layer of this.layers.values()) {
      const freq = mapBrightness(this._brightness, layer.baseFilterFreq)
      layer.filter.frequency.setTargetAtTime(freq, now, 0.1)
    }
  }

  setSpatialLevel(value: number): void {
    this._spatialLevel = clamp(value)
    this.oneShotPlayer?.setSpatialLevel(this._spatialLevel)
    this.applyLayerPan('wind')
    this.applyLayerPan('water')
    this.applyLayerPan('drone')
  }

  /** 更新调度器参数（钟声/古琴概率） */
  setSchedulerParams(params: Partial<SchedulerParams>): void {
    this.scheduler?.setParams(params)
  }

  // — 播放控制 —

  async play(): Promise<void> {
    await this.ensureRunning()
    this.stopImmediate()

    const ctx = this.ctx!
    const now = ctx.currentTime

    // 总线淡入：fadeGain 从 0 渐起到 1
    this.fadeGain!.gain.setValueAtTime(0, now)
    this.fadeGain!.gain.linearRampToValueAtTime(1, now + FADE_IN_TIME)

    this.createNoiseLayer('wind', now)
    this.createNoiseLayer('water', now)
    this.createDroneLayer('drone', now)

    this._playing = true
    this.scheduleEvolution()

    // M3：启动调度器
    if (!this.oneShotPlayer) {
      this.oneShotPlayer = new OneShotPlayer(ctx, this.masterGain!)
    }
    this.oneShotPlayer.setSpatialLevel(this._spatialLevel)
    this.oneShotPlayer.setInstrumentLevel(this._instrumentLevel)
    this.oneShotPlayer.setScale(this.preset.scale)
    if (!this.scheduler) {
      this.scheduler = new Scheduler(this.oneShotPlayer)
    }
    this.scheduler.start()
  }

  stop(): void {
    if (!this._playing || !this.ctx) {
      this._playing = false
      return
    }
    if (this._fading) return

    this._fading = true
    const now = this.ctx.currentTime

    // 总线淡出
    this.fadeGain!.gain.cancelScheduledValues(now)
    this.fadeGain!.gain.setValueAtTime(this.fadeGain!.gain.value, now)
    this.fadeGain!.gain.linearRampToValueAtTime(0, now + FADE_DURATION)

    setTimeout(() => {
      this.stopImmediate()
      this._fading = false
    }, FADE_DURATION * 1000)
  }

  stopImmediate(): void {
    this.scheduler?.stop()
    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer)
      this.evolutionTimer = null
    }

    // 立即静音总线
    if (this.fadeGain && this.ctx) {
      this.fadeGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this.fadeGain.gain.setValueAtTime(0, this.ctx.currentTime)
    }

    for (const [, layer] of this.layers) {
      try { layer.source.stop() } catch { /* already stopped */ }
      layer.source.disconnect()
      layer.filter.disconnect()
      layer.panner.disconnect()
      layer.gain.disconnect()
    }
    this.layers.clear()
    this._playing = false
  }

  dispose(): void {
    this.stopImmediate()
    this._noiseBuffers = {}
    this.scheduler?.stop()
    this.scheduler = null
    this.oneShotPlayer = null
    this.masterGain?.disconnect()
    this.masterGain = null
    this.fadeGain?.disconnect()
    this.fadeGain = null
    this.ctx?.close()
    this.ctx = null
  }

  // — 内部：层创建 —

  private createNoiseLayer(name: 'wind' | 'water', now: number): void {
    const ctx = this.ctx!
    const config = LAYER_CONFIGS[name]
    const baseFilterFreq = name === 'wind' ? this.preset.windFilter : this.preset.waterFilter

    const source = ctx.createBufferSource()
    source.buffer = this.getNoiseBuffer(name)
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = config.filterType
    filter.frequency.value = mapBrightness(this._brightness, baseFilterFreq)
    filter.Q.value = config.filterQ

    const gain = ctx.createGain()
    const layerGain = this.getLayerGain(name)
    gain.gain.setValueAtTime(layerGain, now) // 层增益直接设为目标值

    const panner = ctx.createStereoPanner()
    panner.pan.value = getLayerPan(name, this._spatialLevel, this.preset)

    source.connect(filter)
    filter.connect(panner)
    panner.connect(gain)
    gain.connect(this.masterGain!)
    source.start(now)

    this.layers.set(name, { source, filter, panner, gain, baseGain: layerGain, baseFilterFreq })
  }

  private createDroneLayer(name: 'drone', now: number): void {
    const ctx = this.ctx!
    const config = LAYER_CONFIGS.drone

    const osc = ctx.createOscillator()
    osc.type = config.oscType!
    osc.frequency.value = this.preset.droneFrequency

    const filter = ctx.createBiquadFilter()
    filter.type = config.filterType
    filter.frequency.value = mapBrightness(this._brightness, this.preset.droneFilter) * 0.3
    filter.Q.value = config.filterQ

    const gain = ctx.createGain()
    const layerGain = this.getDroneGain()
    gain.gain.setValueAtTime(layerGain, now)

    const panner = ctx.createStereoPanner()
    panner.pan.value = getLayerPan(name, this._spatialLevel, this.preset)

    osc.connect(filter)
    filter.connect(panner)
    panner.connect(gain)
    gain.connect(this.masterGain!)
    osc.start(now)

    this.layers.set(name, { source: osc, filter, panner, gain, baseGain: layerGain, baseFilterFreq: this.preset.droneFilter })
  }

  // — 内部：工具 —

  private applyLayerGain(name: LayerName, value: number): void {
    const layer = this.layers.get(name)
    if (!layer || !this.ctx) return
    layer.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
  }

  private getDroneGain(): number {
    return this._instrumentLevel * this.preset.droneGain
  }

  private getLayerGain(name: 'wind' | 'water'): number {
    const base = name === 'wind' ? this.preset.windGain : this.preset.waterGain
    return this._natureLevel * base
  }

  private applyLayerPan(name: LayerName): void {
    const layer = this.layers.get(name)
    if (!layer || !this.ctx) return
    layer.panner.pan.setTargetAtTime(getLayerPan(name, this._spatialLevel, this.preset), this.ctx.currentTime, 0.2)
  }

  private getNoiseBuffer(name: 'wind' | 'water'): AudioBuffer {
    if (this._noiseBuffers[name]) return this._noiseBuffers[name]
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const length = sr * BUFFER_SECONDS
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)

    // 生成原始噪声，再用不同平滑窗口塑造风/水质感，避免短循环和同源相关感。
    const raw = new Float32Array(length)
    for (let i = 0; i < length; i++) raw[i] = Math.random() * 2 - 1

    // 循环移动平均
    const win = Math.floor(sr * (name === 'wind' ? 0.035 : 0.006))
    let sum = 0
    for (let j = 0; j < win; j++) {
      sum += raw[j % length]
    }
    for (let i = 0; i < length; i++) {
      const breath = name === 'wind'
        ? 0.62 + 0.38 * Math.sin((i / sr) * Math.PI * 2 / 17 + Math.sin(i / sr / 11))
        : 0.82 + 0.18 * Math.sin((i / sr) * Math.PI * 2 / 9.5)
      data[i] = (sum / win) * breath
      sum -= raw[i]
      sum += raw[(i + win) % length]
    }

    this._noiseBuffers[name] = buffer
    return buffer
  }

  private scheduleEvolution(): void {
    if (!this._playing || !this.ctx) return
    const delay = rand(5.5, 11)
    this.evolutionTimer = setTimeout(() => {
      this.evolveLayers()
      this.scheduleEvolution()
    }, delay * 1000)
  }

  private evolveLayers(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const wind = this.layers.get('wind')
    const water = this.layers.get('water')
    const drone = this.layers.get('drone')

    if (wind) {
      wind.gain.gain.setTargetAtTime(this.getLayerGain('wind') * rand(0.84, 1.12), now, rand(2.8, 5.2))
      wind.filter.frequency.setTargetAtTime(mapBrightness(this._brightness, this.preset.windFilter) * rand(0.82, 1.18), now, rand(3, 6))
      wind.panner.pan.setTargetAtTime(getLayerPan('wind', this._spatialLevel, this.preset) + rand(-0.04, 0.04), now, rand(3, 6))
    }

    if (water) {
      water.gain.gain.setTargetAtTime(this.getLayerGain('water') * rand(0.9, 1.08), now, rand(3, 6))
      water.filter.frequency.setTargetAtTime(mapBrightness(this._brightness, this.preset.waterFilter) * rand(0.9, 1.12), now, rand(3, 6))
      water.panner.pan.setTargetAtTime(getLayerPan('water', this._spatialLevel, this.preset) + rand(-0.03, 0.03), now, rand(3, 6))
    }

    if (drone && drone.source instanceof OscillatorNode) {
      drone.gain.gain.setTargetAtTime(this.getDroneGain() * rand(0.72, 1.02), now, rand(4, 8))
      drone.source.frequency.setTargetAtTime(this.preset.droneFrequency * rand(0.985, 1.012), now, rand(5, 9))
    }
  }
}

// — 工具函数 —

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function mapBrightness(brightness: number, baseFreq: number): number {
  return baseFreq * (0.3 + brightness * 2.2)
}

function getLayerPan(name: LayerName, spatialLevel: number, preset = getModePreset('meditate').engine): number {
  const positions: Record<LayerName, number> = {
    wind: preset.windPan,
    water: preset.waterPan,
    drone: 0,
  }
  return positions[name] * spatialLevel
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** 全局单例 */
export const audioEngine = new AudioEngine()
