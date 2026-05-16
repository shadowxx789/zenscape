/**
 * AudioEngine — ZenScape M2
 *
 * 多层混音架构：
 * - 风（white noise + bandpass）
 * - 水（white noise + high bandpass）
 * - Drone（低频 oscillator + slight modulation）
 *
 * 每层独立 GainNode → masterGain → destination
 * brightness 控制滤波器频率
 * natureLevel 联动风 + 水
 * instrumentLevel 控制 drone
 */

const FADE_DURATION = 3
const BUFFER_SECONDS = 8

// — 层配置 —
interface LayerConfig {
  type: 'noise' | 'oscillator'
  filterFreq: number
  filterQ: number
  filterType: BiquadFilterType
  defaultGain: number
  // oscillator 专用
  oscFreq?: number
  oscType?: OscillatorType
}

const LAYER_CONFIGS: Record<string, LayerConfig> = {
  wind: {
    type: 'noise',
    filterFreq: 600,
    filterQ: 0.8,
    filterType: 'bandpass',
    defaultGain: 0.35,
  },
  water: {
    type: 'noise',
    filterFreq: 2200,
    filterQ: 0.5,
    filterType: 'bandpass',
    defaultGain: 0.2,
  },
  drone: {
    type: 'oscillator',
    filterFreq: 200,
    filterQ: 1.0,
    filterType: 'lowpass',
    defaultGain: 0.25,
    oscFreq: 80,
    oscType: 'sine',
  },
}

// 运行中的层节点
interface ActiveLayer {
  source: AudioBufferSourceNode | OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
}

export type LayerName = 'wind' | 'water' | 'drone'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private layers: Map<LayerName, ActiveLayer> = new Map()
  private _playing = false
  private _fading = false

  // 缓存
  private _noiseBuffer: AudioBuffer | null = null

  // drone LFO 节点（需要单独清理）
  private droneLfo: OscillatorNode | null = null
  private droneLfoGain: GainNode | null = null

  // 当前参数值
  private _masterVolume = 0.6
  private _brightness = 0.5
  private _natureLevel = 0.7
  private _instrumentLevel = 0.5
  private _spatialLevel = 0.3

  get playing() { return this._playing }

  /** 初始化 AudioContext（必须在用户手势回调中调用） */
  init(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this._masterVolume
    this.masterGain.connect(this.ctx.destination)
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

  /** natureLevel 联动 wind + water 层音量 */
  setNatureLevel(value: number): void {
    this._natureLevel = clamp(value)
    this.applyLayerGain('wind', this._natureLevel)
    this.applyLayerGain('water', this._natureLevel)
  }

  /** instrumentLevel 控制 drone 层音量 */
  setInstrumentLevel(value: number): void {
    this._instrumentLevel = clamp(value)
    this.applyLayerGain('drone', this._instrumentLevel)
  }

  /** brightness 控制所有层的滤波器频率 */
  setBrightness(value: number): void {
    this._brightness = clamp(value)
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const [, layer] of this.layers) {
      const config = LAYER_CONFIGS[getLayerKey(layer, this.layers) ?? 'wind']
      const freq = mapBrightness(this._brightness, config.filterFreq)
      layer.filter.frequency.setTargetAtTime(freq, now, 0.1)
    }
  }

  /** spatial（预留接口，M3 可接入 reverb） */
  setSpatialLevel(value: number): void {
    this._spatialLevel = clamp(value)
  }

  // — 播放控制 —

  async play(): Promise<void> {
    await this.ensureRunning()
    this.stopImmediate()

    const ctx = this.ctx!
    const now = ctx.currentTime

    // 风
    this.createNoiseLayer('wind', now)
    // 水
    this.createNoiseLayer('water', now)
    // Drone
    this.createDroneLayer('drone', now)

    this._playing = true
  }

  async stop(): Promise<void> {
    if (!this._playing || !this.ctx) {
      this._playing = false
      return
    }
    if (this._fading) return

    this._fading = true
    const now = this.ctx.currentTime

    for (const [, layer] of this.layers) {
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now)
      layer.gain.gain.exponentialRampToValueAtTime(0.001, now + FADE_DURATION)
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        this.stopImmediate()
        this._fading = false
        resolve()
      }, FADE_DURATION * 1000)
    })
  }

  stopImmediate(): void {
    for (const [, layer] of this.layers) {
      try { layer.source.stop() } catch { /* already stopped */ }
      layer.source.disconnect()
      layer.filter.disconnect()
      layer.gain.disconnect()
    }
    this.layers.clear()
    try { this.droneLfo?.stop() } catch { /* already stopped */ }
    this.droneLfo?.disconnect()
    this.droneLfoGain?.disconnect()
    this.droneLfo = null
    this.droneLfoGain = null
    this._playing = false
  }

  dispose(): void {
    this.stopImmediate()
    this._noiseBuffer = null
    this.masterGain?.disconnect()
    this.masterGain = null
    this.ctx?.close()
    this.ctx = null
  }

  // — 内部：层创建 —

  private createNoiseLayer(name: 'wind' | 'water', now: number): void {
    const ctx = this.ctx!
    const config = LAYER_CONFIGS[name]

    const source = ctx.createBufferSource()
    source.buffer = this.getNoiseBuffer()
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = config.filterType
    filter.frequency.value = mapBrightness(this._brightness, config.filterFreq)
    filter.Q.value = config.filterQ

    const gain = ctx.createGain()
    const layerGain = name === 'wind' ? this._natureLevel : this._natureLevel * 0.7
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(layerGain, now + FADE_DURATION)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain!)
    source.start(now)

    this.layers.set(name, { source, filter, gain })
  }

  private createDroneLayer(name: 'drone', now: number): void {
    const ctx = this.ctx!
    const config = LAYER_CONFIGS.drone

    // 主 oscillator
    const osc = ctx.createOscillator()
    osc.type = config.oscType!
    osc.frequency.value = config.oscFreq!

    // 轻微 LFM 调制，让 drone 不那么死板
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.3 // 很慢的调制
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 3 // 调制幅度 ±3Hz
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfo.start(now)

    const filter = ctx.createBiquadFilter()
    filter.type = config.filterType
    filter.frequency.value = mapBrightness(this._brightness, config.filterFreq)
    filter.Q.value = config.filterQ

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(this._instrumentLevel, now + FADE_DURATION)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain!)
    osc.start(now)

    this.layers.set(name, { source: osc, filter, gain })
    this.droneLfo = lfo
    this.droneLfoGain = lfoGain
  }

  // — 内部：工具 —

  private applyLayerGain(name: LayerName, value: number): void {
    const layer = this.layers.get(name)
    if (!layer || !this.ctx) return
    layer.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
  }

  private getNoiseBuffer(): AudioBuffer {
    if (this._noiseBuffer) return this._noiseBuffer
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const length = sr * BUFFER_SECONDS
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)

    // 白噪声 + 移动平均柔化
    const raw = new Float32Array(length)
    for (let i = 0; i < length; i++) raw[i] = Math.random() * 2 - 1

    const win = Math.floor(sr * 0.015) // 15ms 窗口
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += raw[i]
      if (i >= win) sum -= raw[i - win]
      data[i] = sum / Math.min(i + 1, win)
    }

    this._noiseBuffer = buffer
    return buffer
  }
}

// — 工具函数 —

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** brightness (0-1) 映射到滤波器频率：基准值的 0.3x ~ 2.5x */
function mapBrightness(brightness: number, baseFreq: number): number {
  return baseFreq * (0.3 + brightness * 2.2)
}

function getLayerKey(layer: ActiveLayer, map: Map<string, ActiveLayer>): string | null {
  for (const [k, v] of map) {
    if (v === layer) return k
  }
  return null
}

/** 全局单例 */
export const audioEngine = new AudioEngine()
