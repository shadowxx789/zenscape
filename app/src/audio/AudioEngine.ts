/**
 * AudioEngine — BreezeScape
 *
 * 多层混音 + 概率事件调度：
 * - 风（pink noise + air-band shaping）
 * - 水（pink noise + stream-band shaping）
 * - Drone（低频 oscillator）
 * - 钟声/古琴（OneShotPlayer + Scheduler 概率触发）
 *
 * 信号链：
 * layers → ambientBus ─┬→ masterGain (干声)
 *                      └→ ambientReverbSend → ambientConvolver → ambientReverbGain → masterGain (湿声)
 * events → eventBus → eventTrim ─┬→ masterGain (干声)
 *                                └→ eventReverbSend → eventConvolver → eventReverbGain → masterGain (湿声)
 * masterGain → limiter → fadeGain → destination
 *
 * fadeGain 负责播放/停止的淡入淡出（从 0 到 1）
 * masterGain 负责音量滑杆
 */

import { OneShotPlayer } from './OneShotPlayer'
import { Scheduler, type SchedulerParams } from './scheduler'
import { getModePreset, type EnginePreset } from './soundscapes'
import type { Mode } from '../types'
import { AudioDiagnostics } from './AudioDiagnostics'

const FADE_DURATION = 3
const BUFFER_SECONDS = 61
const FADE_IN_TIME = 0.5 // 总线淡入 500ms
const USE_PINK_NOISE = true
const PINK_NOISE_GAIN_COMPENSATION = 0.85
const LOOP_CROSSFADE_SECONDS = 0.75
const WATER_CLARITY_CAP = 0.6

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
    defaultGain: 0.01,
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
  bodyFilter?: BiquadFilterNode
  surgeGain?: GainNode
  surgeDepth?: GainNode
  surgeLFO?: OscillatorNode
  detailGain?: GainNode
  detailFilter?: BiquadFilterNode
}

export type LayerName = 'wind' | 'water' | 'drone'

export interface RecentEvent {
  time: number
  type: 'temple_bell' | 'guqin_harmonic'
  volume: number
  pan: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private fadeGain: GainNode | null = null
  private ambientBus: GainNode | null = null
  private eventBus: GainNode | null = null
  private ambientReverbSend: GainNode | null = null
  private ambientConvolver: ConvolverNode | null = null
  private ambientReverbGain: GainNode | null = null
  private eventReverbSend: GainNode | null = null
  private eventConvolver: ConvolverNode | null = null
  private eventReverbGain: GainNode | null = null
  private eventTrim: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private layers: Map<LayerName, ActiveLayer> = new Map()
  private _playing = false
  private _fading = false
  private _fadeToken = 0

  private _noiseBuffers: Record<string, AudioBuffer> = {}
  private _noiseWarmupStarted = false
  private evolutionTimer: ReturnType<typeof setTimeout> | null = null
  private _waterRebuildToken = 0
  private _waterClarity = 0.35

  private oneShotPlayer: OneShotPlayer | null = null
  private scheduler: Scheduler | null = null
  private preset: EnginePreset = getModePreset('meditate').engine

  private _masterVolume = 0.6
  private _brightness = 0.5
  private _natureLevel = 0.7
  private _instrumentLevel = 0.5
  private _spatialLevel = 0.3
  private _reverbWet = 0.25
  private _currentMode: Mode | null = null
  private _diagnostics: AudioDiagnostics | null = null
  private _recentEvents: RecentEvent[] = []
  private _ambientMuted = false
  private _eventsSolo = false
  private _preMuteAmbientGains: Map<LayerName, number> = new Map()

  get playing() { return this._playing }

  get diagnostics(): AudioDiagnostics | null {
    return this._diagnostics
  }

  triggerEvent(type: 'temple_bell' | 'guqin_harmonic'): void {
    if (!this.oneShotPlayer || !this._playing) {
      console.warn('[AudioEngine] triggerEvent ignored: not playing')
      return
    }
    this.oneShotPlayer.play(type)
  }

  muteAmbient(muted: boolean): void {
    if (!this.ctx) return
    if (muted === this._ambientMuted) return
    this._ambientMuted = muted
    const now = this.ctx.currentTime

    for (const [name, layer] of this.layers) {
      if (muted) {
        this._preMuteAmbientGains.set(name, layer.gain.gain.value)
        layer.gain.gain.setTargetAtTime(0, now, 0.05)
      } else {
        const restored = this._preMuteAmbientGains.get(name) ?? layer.baseGain
        layer.gain.gain.setTargetAtTime(restored, now, 0.05)
      }
    }
  }

  soloEvents(solo: boolean): void {
    this._eventsSolo = solo
    this.muteAmbient(solo)
  }

  getRecentEvents(): RecentEvent[] {
    return [...this._recentEvents]
  }

  get ambientMuted(): boolean { return this._ambientMuted }
  get eventsSolo(): boolean { return this._eventsSolo }

  private _recordEvent(type: 'temple_bell' | 'guqin_harmonic'): void {
    this._recentEvents.unshift({
      time: performance.now(),
      type,
      volume: this._instrumentLevel,
      pan: 0,
    })
    if (this._recentEvents.length > 20) {
      this._recentEvents.length = 20
    }
  }

  private clampClarity(value: number): number {
    return Math.max(0, Math.min(WATER_CLARITY_CAP, value))
  }

  setMode(mode: Mode): void {
    if (this._currentMode === mode) return
    const previousMode = this._currentMode
    this._currentMode = mode
    this.preset = getModePreset(mode).engine
    this._waterClarity = this.clampClarity(this.preset.waterClarity)
    this.setReverbWet(this.preset.reverbWet)
    this.oneShotPlayer?.setScale(this.preset.scale)

    if (!this.ctx) return

    this.applyLayerGain('wind', this.getLayerGain('wind'))
    const wind = this.layers.get('wind')
    if (wind) {
      wind.filter.frequency.setTargetAtTime(
        mapBrightness(this._brightness, this.preset.windFilter),
        this.ctx.currentTime,
        0.1,
      )
    }

    if (previousMode && this.layers.has('water')) {
      this.rebuildWaterLayer()
    } else {
      this.applyLayerGain('water', this.getLayerGain('water'))
      this.applyWaterClarity()
    }

    this.applyLayerGain('drone', this.getDroneGain())
    this.setBrightness(this._brightness)
    this.setSpatialLevel(this._spatialLevel)

    const drone = this.layers.get('drone')?.source
    if (drone instanceof OscillatorNode) {
      drone.frequency.setTargetAtTime(this.preset.droneFrequency, this.ctx.currentTime, 1.8)
    }
  }

  init(): void {
    if (this.ctx) return
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!AudioCtx) {
      throw new Error('当前浏览器不支持 Web Audio API，请尝试使用 Chrome 或 Safari')
    }
    this.ctx = new AudioCtx()
    const ctx = this.ctx

    this.fadeGain = ctx.createGain()
    this.fadeGain.gain.value = 0
    this.fadeGain.connect(ctx.destination)

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -1.0
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.10
    this.limiter.connect(this.fadeGain)

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = this._masterVolume
    this.masterGain.connect(this.limiter)

    this.ambientBus = ctx.createGain()
    this.ambientBus.gain.value = 1.0
    this.ambientBus.connect(this.masterGain)

    this.ambientReverbSend = ctx.createGain()
    this.ambientReverbSend.gain.value = 0
    this.ambientBus.connect(this.ambientReverbSend)

    this.ambientConvolver = ctx.createConvolver()
    this.ambientConvolver.normalize = true
    this.ambientReverbSend.connect(this.ambientConvolver)

    this.ambientReverbGain = ctx.createGain()
    this.ambientReverbGain.gain.value = 0.25
    this.ambientConvolver.connect(this.ambientReverbGain)
    this.ambientReverbGain.connect(this.masterGain)

    this.eventBus = ctx.createGain()
    this.eventBus.gain.value = 1.0
    this.eventTrim = ctx.createGain()
    this.eventTrim.gain.value = 3.0
    this.eventBus.connect(this.eventTrim)
    this.eventTrim.connect(this.masterGain)

    this.eventReverbSend = ctx.createGain()
    this.eventReverbSend.gain.value = 0
    this.eventTrim.connect(this.eventReverbSend)

    this.eventConvolver = ctx.createConvolver()
    this.eventConvolver.normalize = true
    this.eventReverbSend.connect(this.eventConvolver)

    this.eventReverbGain = ctx.createGain()
    this.eventReverbGain.gain.value = 0.30
    this.eventConvolver.connect(this.eventReverbGain)
    this.eventReverbGain.connect(this.masterGain)

    const sharedIR = generateMountainValleyIR(ctx, 6)
    this.ambientConvolver.buffer = sharedIR
    this.eventConvolver.buffer = sharedIR

    this.setReverbWet(this.preset.reverbWet)

    this._diagnostics = new AudioDiagnostics(ctx)
    this._diagnostics.attachProbe('master', this.masterGain)
    this._diagnostics.attachProbe('ambientBus', this.ambientBus)
    this._diagnostics.attachProbe('eventBus', this.eventBus)
    this._diagnostics.attachProbe('eventTrim', this.eventTrim)
    this._diagnostics.attachProbe('ambientReverb', this.ambientReverbGain)
    this._diagnostics.attachProbe('eventReverb', this.eventReverbGain)
    this._diagnostics.attachProbe('limiter', this.limiter)

    setTimeout(() => this.warmupNoiseBuffers(), 0)

    this.ctx.addEventListener('statechange', () => {
      if (this.ctx && this.ctx.state === 'suspended' && this._playing) {
        this.ctx.resume().catch(() => { /* ignore */ })
      }
    })
  }

  private async ensureRunning(): Promise<void> {
    if (!this.ctx) this.init()
    if (!this.ctx) {
      throw new Error('当前浏览器不支持 Web Audio API，请尝试使用 Chrome 或 Safari')
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* ignore */ })
    }
  }

  setMasterVolume(value: number): void {
    const clamped = clamp(value)
    if (this._masterVolume === clamped) return
    this._masterVolume = clamped
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this._masterVolume, this.ctx.currentTime, 0.05)
    }
  }

  setNatureLevel(value: number): void {
    const clamped = clamp(value)
    if (this._natureLevel === clamped) return
    this._natureLevel = clamped
    this.applyLayerGain('wind', this.getLayerGain('wind'))
    this.applyLayerGain('water', this.getLayerGain('water'))
  }

  setInstrumentLevel(value: number): void {
    const clamped = clamp(value)
    if (this._instrumentLevel === clamped) return
    this._instrumentLevel = clamped
    this.applyLayerGain('drone', this.getDroneGain())
    this.oneShotPlayer?.setInstrumentLevel(this._instrumentLevel)
  }

  setBrightness(value: number): void {
    const clamped = clamp(value)
    if (this._brightness === clamped) return
    this._brightness = clamped
    if (!this.ctx) return
    const now = this.ctx.currentTime

    for (const [name, layer] of this.layers) {
      const freq = mapBrightness(this._brightness, layer.baseFilterFreq)
      if (name === 'water') {
        layer.filter.frequency.setTargetAtTime(freq * (1 + this._waterClarity * 0.3), now, 0.1)
      } else {
        layer.filter.frequency.setTargetAtTime(freq, now, 0.1)
      }
    }
  }

  setWaterClarity(value: number): void {
    const clamped = this.clampClarity(value)
    this._waterClarity = clamped
    this.applyWaterClarity()
  }

  private applyWaterClarity(): void {
    if (!this.ctx) return
    const water = this.layers.get('water')
    if (!water) return
    const now = this.ctx.currentTime

    if (water.detailGain) {
      water.detailGain.gain.setTargetAtTime(this._waterClarity * 0.25, now, 0.1)
    }
    if (water.filter) {
      const baseFreq = mapBrightness(this._brightness, this.preset.waterFilter)
      water.filter.frequency.setTargetAtTime(baseFreq * (1 + this._waterClarity * 0.3), now, 0.1)
    }
  }

  devReduceWindToAir(): void {
    if (!this.ctx) return
    const wind = this.layers.get('wind')
    if (wind) wind.gain.gain.setTargetAtTime(0.02, this.ctx.currentTime, 0.5)
  }

  devRestoreWind(): void {
    if (!this.ctx) return
    const wind = this.layers.get('wind')
    if (wind) wind.gain.gain.setTargetAtTime(this.getLayerGain('wind'), this.ctx.currentTime, 0.5)
  }

  devSoloWater(): void {
    if (!this.ctx) return
    const wind = this.layers.get('wind')
    const drone = this.layers.get('drone')
    if (wind) wind.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
    if (drone) drone.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
  }

  devUnsolo(): void {
    if (!this.ctx) return
    const wind = this.layers.get('wind')
    const drone = this.layers.get('drone')
    if (wind) wind.gain.gain.setTargetAtTime(this.getLayerGain('wind'), this.ctx.currentTime, 0.3)
    if (drone) drone.gain.gain.setTargetAtTime(this.getDroneGain(), this.ctx.currentTime, 0.3)
  }

  setSpatialLevel(value: number): void {
    const clamped = clamp(value)
    if (this._spatialLevel === clamped) return
    this._spatialLevel = clamped
    this.oneShotPlayer?.setSpatialLevel(this._spatialLevel)
    this.applyLayerPan('wind')
    this.applyLayerPan('water')
    this.applyLayerPan('drone')
    const base = this.preset.reverbWet
    const offset = (this._spatialLevel - 0.5) * 0.7
    this.setReverbWet(base + offset)
  }

  setReverbWet(value: number): void {
    this._reverbWet = clamp(value)
    if (!this.ctx || !this.ambientReverbSend || !this.eventReverbSend) return
    const ambientWet = clamp(this._reverbWet * 1.2)
    this.ambientReverbSend.gain.setTargetAtTime(ambientWet, this.ctx.currentTime, 0.1)
    const eventWet = clamp(this._reverbWet * 0.5)
    this.eventReverbSend.gain.setTargetAtTime(eventWet, this.ctx.currentTime, 0.1)
  }

  setSchedulerParams(params: Partial<SchedulerParams>): void {
    this.scheduler?.setParams(params)
  }

  async play(): Promise<void> {
    await this.ensureRunning()
    this.stopImmediate()

    const ctx = this.ctx!
    const now = ctx.currentTime

    this.fadeGain!.gain.setValueAtTime(0, now)
    this.fadeGain!.gain.linearRampToValueAtTime(1, now + FADE_IN_TIME)

    this.createNoiseLayer('wind', now)
    this.createNoiseLayer('water', now)
    this.createDroneLayer('drone', now)

    this._playing = true
    this.scheduleEvolution()

    if (!this.oneShotPlayer) {
      this.oneShotPlayer = new OneShotPlayer(ctx, this.eventBus!)
      const originalPlay = this.oneShotPlayer.play.bind(this.oneShotPlayer)
      this.oneShotPlayer.play = (type, opts) => {
        this._recordEvent(type)
        originalPlay(type, opts)
      }
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
    this.fadeGain!.gain.cancelScheduledValues(now)
    this.fadeGain!.gain.setValueAtTime(this.fadeGain!.gain.value, now)
    this.fadeGain!.gain.linearRampToValueAtTime(0, now + FADE_DURATION)

    const token = ++this._fadeToken
    setTimeout(() => {
      if (this._fadeToken !== token) return
      this.stopImmediate()
      this._fading = false
    }, FADE_DURATION * 1000)
  }

  private disconnectLayer(layer: ActiveLayer): void {
    try { layer.source.stop() } catch { /* already stopped */ }
    try { layer.source.disconnect() } catch { /* ignore */ }
    try { layer.filter.disconnect() } catch { /* ignore */ }
    try { layer.panner.disconnect() } catch { /* ignore */ }
    try { layer.gain.disconnect() } catch { /* ignore */ }
    if (layer.bodyFilter) try { layer.bodyFilter.disconnect() } catch { /* ignore */ }
    if (layer.surgeLFO) {
      try { layer.surgeLFO.stop() } catch { /* ignore */ }
      try { layer.surgeLFO.disconnect() } catch { /* ignore */ }
    }
    if (layer.surgeDepth) try { layer.surgeDepth.disconnect() } catch { /* ignore */ }
    if (layer.surgeGain) try { layer.surgeGain.disconnect() } catch { /* ignore */ }
    if (layer.detailGain) try { layer.detailGain.disconnect() } catch { /* ignore */ }
    if (layer.detailFilter) try { layer.detailFilter.disconnect() } catch { /* ignore */ }
  }

  stopImmediate(): void {
    this._fadeToken++
    this._fading = false
    this.scheduler?.stop()
    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer)
      this.evolutionTimer = null
    }

    if (this.fadeGain && this.ctx) {
      this.fadeGain.gain.cancelScheduledValues(this.ctx.currentTime)
      this.fadeGain.gain.setValueAtTime(0, this.ctx.currentTime)
    }

    this._waterRebuildToken++
    for (const [, layer] of this.layers) this.disconnectLayer(layer)
    this.layers.clear()
    this._playing = false
  }

  dispose(): void {
    this.stopImmediate()
    this._noiseBuffers = {}
    this._noiseWarmupStarted = false
    this.scheduler?.stop()
    this.scheduler = null
    this.oneShotPlayer = null
    this._diagnostics?.dispose()
    this._diagnostics = null

    try { this.ambientBus?.disconnect() } catch { /* ignore */ }
    this.ambientBus = null
    try { this.ambientReverbSend?.disconnect() } catch { /* ignore */ }
    this.ambientReverbSend = null
    try { this.ambientConvolver?.disconnect() } catch { /* ignore */ }
    this.ambientConvolver = null
    try { this.ambientReverbGain?.disconnect() } catch { /* ignore */ }
    this.ambientReverbGain = null
    try { this.eventBus?.disconnect() } catch { /* ignore */ }
    this.eventBus = null
    try { this.eventTrim?.disconnect() } catch { /* ignore */ }
    this.eventTrim = null
    try { this.eventReverbSend?.disconnect() } catch { /* ignore */ }
    this.eventReverbSend = null
    try { this.eventConvolver?.disconnect() } catch { /* ignore */ }
    this.eventConvolver = null
    try { this.eventReverbGain?.disconnect() } catch { /* ignore */ }
    this.eventReverbGain = null
    try { this.limiter?.disconnect() } catch { /* ignore */ }
    this.limiter = null
    try { this.masterGain?.disconnect() } catch { /* ignore */ }
    this.masterGain = null
    try { this.fadeGain?.disconnect() } catch { /* ignore */ }
    this.fadeGain = null
    try { this.ctx?.close() } catch { /* ignore */ }
    this.ctx = null
  }

  private createNoiseLayer(name: 'wind' | 'water', now: number): void {
    const ctx = this.ctx!
    const config = LAYER_CONFIGS[name]
    const baseFilterFreq = name === 'wind' ? this.preset.windFilter : this.preset.waterFilter

    const source = ctx.createBufferSource()
    source.buffer = this.getNoiseBuffer(name)
    source.loop = true

    const gain = ctx.createGain()
    const layerGain = this.getLayerGain(name)
    gain.gain.setValueAtTime(layerGain, now)

    const panner = ctx.createStereoPanner()
    panner.pan.value = getLayerPan(name, this._spatialLevel, this.preset)

    if (name === 'water') {
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = baseFilterFreq * 1.8
      lowpass.Q.value = 0.5

      const bandpass = ctx.createBiquadFilter()
      bandpass.type = 'bandpass'
      const clarity = this._waterClarity
      bandpass.frequency.value = mapBrightness(this._brightness, baseFilterFreq) * (1 + clarity * 0.3)
      bandpass.Q.value = 0.8

      const detailFilter = ctx.createBiquadFilter()
      detailFilter.type = 'highpass'
      detailFilter.frequency.value = 1800
      detailFilter.Q.value = 0.5

      const detailGain = ctx.createGain()
      detailGain.gain.value = clarity * 0.25

      const surgeGain = ctx.createGain()
      surgeGain.gain.value = 0.3

      const surgeLFO = ctx.createOscillator()
      surgeLFO.type = 'sine'
      surgeLFO.frequency.value = this._currentMode === 'sleep' ? 0.08 : this._currentMode === 'focus' ? 0.15 : 0.11

      const surgeDepth = ctx.createGain()
      surgeDepth.gain.value = 0.12 * (1 - clarity * 0.3)

      surgeLFO.connect(surgeDepth)
      surgeDepth.connect(surgeGain.gain)
      surgeLFO.start(now)

      source.connect(lowpass)
      lowpass.connect(surgeGain)
      surgeGain.connect(bandpass)
      lowpass.connect(detailFilter)
      detailFilter.connect(detailGain)
      detailGain.connect(bandpass)
      bandpass.connect(panner)
      panner.connect(gain)
      gain.connect(this.ambientBus!)
      source.start(now)

      this.layers.set(name, {
        source,
        filter: bandpass,
        panner,
        gain,
        baseGain: layerGain,
        baseFilterFreq,
        bodyFilter: lowpass,
        surgeGain,
        surgeDepth,
        surgeLFO,
        detailGain,
        detailFilter,
      })
      return
    }

    const filter = ctx.createBiquadFilter()
    filter.type = config.filterType
    filter.frequency.value = mapBrightness(this._brightness, baseFilterFreq)
    filter.Q.value = config.filterQ

    source.connect(filter)
    filter.connect(panner)
    panner.connect(gain)
    gain.connect(this.ambientBus!)
    source.start(now)

    this.layers.set(name, { source, filter, panner, gain, baseGain: layerGain, baseFilterFreq })
  }

  private rebuildWaterLayer(): void {
    const water = this.layers.get('water')
    if (!water || !this.ctx) return

    const now = this.ctx.currentTime
    const token = ++this._waterRebuildToken
    water.gain.gain.setTargetAtTime(0, now, 0.3)
    if (water.surgeLFO) {
      try { water.surgeLFO.stop(now + 0.8) } catch { /* ignore */ }
    }

    setTimeout(() => {
      if (this._waterRebuildToken !== token || !this._playing || !this.ctx) return
      this.disconnectLayer(water)
      this.layers.delete('water')
      this.createNoiseLayer('water', this.ctx.currentTime)
    }, 800)
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
    gain.connect(this.ambientBus!)
    osc.start(now)

    this.layers.set(name, { source: osc, filter, panner, gain, baseGain: layerGain, baseFilterFreq: this.preset.droneFilter })
  }

  private applyLayerGain(name: LayerName, value: number): void {
    const layer = this.layers.get(name)
    if (!layer || !this.ctx) return
    layer.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
  }

  private getDroneGain(): number {
    const curve = 0.2 + this._instrumentLevel * 0.6
    return curve * this.preset.droneGain
  }

  private getLayerGain(name: 'wind' | 'water'): number {
    const base = name === 'wind' ? this.preset.windGain : this.preset.waterGain
    return this._natureLevel * base * (USE_PINK_NOISE ? PINK_NOISE_GAIN_COMPENSATION : 1)
  }

  private applyLayerPan(name: LayerName): void {
    const layer = this.layers.get(name)
    if (!layer || !this.ctx) return
    layer.panner.pan.setTargetAtTime(getLayerPan(name, this._spatialLevel, this.preset), this.ctx.currentTime, 0.2)
  }

  private warmupNoiseBuffers(): void {
    if (this._noiseWarmupStarted || !this.ctx || !USE_PINK_NOISE) return
    this._noiseWarmupStarted = true
    this.getNoiseBuffer('wind')
    this.getNoiseBuffer('water')
  }

  private getNoiseBuffer(name: 'wind' | 'water'): AudioBuffer {
    const cacheKey = name === 'water' && this._currentMode
      ? `${name}_${this._currentMode}`
      : name

    if (this._noiseBuffers[cacheKey]) return this._noiseBuffers[cacheKey]
    if (!USE_PINK_NOISE) return this.getNoiseBufferLegacy(name)

    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const length = sr * BUFFER_SECONDS
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)
    const shaped = shapeForLayer(generatePinkNoise(length, sr), name, sr)
    const mode = this._currentMode || 'meditate'

    for (let i = 0; i < length; i++) {
      let breath: number
      if (name === 'wind') {
        breath = 0.62 + 0.38 * Math.sin((i / sr) * Math.PI * 2 / 17 + Math.sin(i / sr / 11))
      } else {
        const t = i / sr
        const surgeRate = mode === 'sleep' ? 0.08 : mode === 'focus' ? 0.15 : 0.11
        const surge = Math.sin(t * Math.PI * 2 * surgeRate) * 0.15
        const undulation = Math.sin(t * Math.PI * 2 * 0.31 + Math.sin(t * 0.13)) * 0.08
        const ripple = Math.sin(t * Math.PI * 2 * 2.7 + Math.sin(t * 0.7)) * 0.03
        const baseLevel = mode === 'sleep' ? 0.85 : mode === 'focus' ? 0.75 : 0.80
        breath = Math.max(0.4, Math.min(1.0, baseLevel + surge + undulation + ripple))
      }
      data[i] = shaped[i] * breath
    }

    data.set(applyLoopCrossfade(data, sr, LOOP_CROSSFADE_SECONDS))
    this._noiseBuffers[cacheKey] = buffer
    return buffer
  }

  private getNoiseBufferLegacy(name: 'wind' | 'water'): AudioBuffer {
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const length = sr * BUFFER_SECONDS
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)
    const raw = new Float32Array(length)
    for (let i = 0; i < length; i++) raw[i] = Math.random() * 2 - 1

    const win = Math.floor(sr * (name === 'wind' ? 0.035 : 0.006))
    let sum = 0
    for (let j = 0; j < win; j++) sum += raw[j % length]
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
      water.filter.frequency.setTargetAtTime(
        mapBrightness(this._brightness, this.preset.waterFilter) * (1 + this._waterClarity * 0.3) * rand(0.9, 1.12),
        now,
        rand(3, 6),
      )
      water.panner.pan.setTargetAtTime(getLayerPan('water', this._spatialLevel, this.preset) + rand(-0.03, 0.03), now, rand(3, 6))
    }

    if (drone && drone.source instanceof OscillatorNode) {
      drone.gain.gain.setTargetAtTime(this.getDroneGain() * rand(0.72, 1.02), now, rand(4, 8))
      drone.source.frequency.setTargetAtTime(this.preset.droneFrequency * rand(0.985, 1.012), now, rand(5, 9))
    }
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function mapBrightness(brightness: number, baseFreq: number): number {
  return baseFreq * (0.3 + brightness * 2.2)
}

function generatePinkNoise(length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return out

  const rows = new Float32Array(16)
  let runningSum = 0
  let counter = 0

  for (let i = 0; i < length; i++) {
    counter++
    const lowBit = counter & -counter
    const rowIndex = Math.log2(lowBit) | 0
    if (rowIndex < rows.length) {
      runningSum -= rows[rowIndex]
      rows[rowIndex] = Math.random() * 2 - 1
      runningSum += rows[rowIndex]
    }
    const white = Math.random() * 2 - 1
    out[i] = (runningSum + white) / (rows.length + 1)
  }

  return out
}

function shapeForLayer(samples: Float32Array, name: 'wind' | 'water', sampleRate: number): Float32Array {
  return name === 'wind'
    ? applyAirBandShape(samples, sampleRate)
    : applyStreamBandShape(samples, sampleRate)
}

function applyAirBandShape(samples: Float32Array, sampleRate: number): Float32Array {
  const deRumbled = applyGentleHighpass(samples, sampleRate, 200)
  return applyOnePoleLowpass(
    applyOnePoleLowpass(deRumbled, sampleRate, 1500),
    sampleRate,
    1800,
  )
}

function applyStreamBandShape(samples: Float32Array, sampleRate: number): Float32Array {
  const lifted = applyGentleHighpass(samples, sampleRate, 800)
  const softened = applyOnePoleLowpass(lifted, sampleRate, 4800)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    out[i] = lifted[i] * 0.65 + softened[i] * 0.35
  }
  return out
}

function applyLoopCrossfade(samples: Float32Array, sampleRate: number, fadeSeconds: number): Float32Array {
  const out = new Float32Array(samples)
  const fadeSamples = Math.min(
    Math.floor(samples.length / 4),
    Math.max(2, Math.floor(sampleRate * fadeSeconds)),
  )
  if (fadeSamples < 2) return out
  const tailStart = samples.length - fadeSamples
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / (fadeSamples - 1)
    const fadeIn = Math.sin(t * Math.PI / 2)
    const fadeOut = Math.cos(t * Math.PI / 2)
    out[i] = samples[i] * fadeIn + samples[tailStart + i] * fadeOut
    out[tailStart + i] = samples[tailStart + i] * fadeOut + samples[i] * fadeIn
  }
  return out
}

function applyOnePoleLowpass(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length)
  const rc = 1 / (Math.PI * 2 * cutoffHz)
  const dt = 1 / sampleRate
  const alpha = dt / (rc + dt)
  let state = 0
  for (let i = 0; i < samples.length; i++) {
    state += alpha * (samples[i] - state)
    out[i] = state
  }
  return out
}

function applyGentleHighpass(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length)
  const low = applyOnePoleLowpass(samples, sampleRate, cutoffHz)
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * 0.5 + (samples[i] - low[i]) * 0.5
  }
  return out
}

function generateMountainValleyIR(ctx: BaseAudioContext, durationSec = 6): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.floor(sr * durationSec)
  const ir = ctx.createBuffer(2, length, sr)
  const preDelaySamples = Math.floor(sr * 0.08)

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    let lpfState = 0
    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        data[i] = (Math.random() * 2 - 1) * 0.002
        continue
      }
      const t = (i - preDelaySamples) / sr
      const totalT = durationSec - 0.08
      const envelope = Math.exp(-3.0 * t / totalT)
      const noise = Math.random() * 2 - 1
      const earlyReflection = t > 0.4 && t < 2.0 && Math.random() < 0.015
        ? (Math.random() * 2 - 1) * 0.3
        : 0
      const raw = (noise * envelope + earlyReflection) * 0.5
      const age = i / length
      const alpha = 0.05 + age * 0.3
      lpfState = raw * (1 - alpha) + lpfState * alpha
      data[i] = lpfState
    }
  }
  return ir
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

export const audioEngine = new AudioEngine()

if (typeof window !== 'undefined') {
  (window as unknown as { audioEngine: AudioEngine }).audioEngine = audioEngine
}
