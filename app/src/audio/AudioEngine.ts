/**
 * AudioEngine — ZenScape M1
 *
 * 最小可用音频引擎：
 * - 用户手势后创建 AudioContext
 * - 合成风声（filtered noise）循环播放
 * - 3 秒指数淡入 / 淡出
 * - 防叠声：play 时若已有实例，先静默停止旧节点
 */

const FADE_DURATION = 3 // seconds
const WIND_BUFFER_SECONDS = 8 // 合成 8 秒噪声，loop 播放
const WIND_FILTER_FREQ = 800 // Hz — 风声的中心频率
const WIND_FILTER_Q = 0.7 // 宽松的 Q 值，让声音自然
const DEFAULT_MASTER_VOLUME = 0.6

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null

  // 当前活跃的风声节点
  private windSource: AudioBufferSourceNode | null = null
  private windGain: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null

  private _playing = false
  private _fading = false

  /** 是否正在播放 */
  get playing(): boolean {
    return this._playing
  }

  /** 初始化 AudioContext（必须在用户手势回调中调用） */
  init(): void {
    if (this.ctx) return

    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = DEFAULT_MASTER_VOLUME
    this.masterGain.connect(this.ctx.destination)
  }

  /** 确保 AudioContext 处于 running 状态 */
  private async ensureRunning(): Promise<void> {
    if (!this.ctx) this.init()
    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume()
    }
  }

  /**
   * 播放风声循环，带 3 秒淡入。
   * 如果已经在播放，不会叠加——先静默停止旧实例。
   */
  async play(): Promise<void> {
    await this.ensureRunning()

    // 防叠声：如果已经有风声在跑，先停掉
    this.stopImmediate()

    const ctx = this.ctx!
    const now = ctx.currentTime

    // — 构建节点链 —
    // source → filter → windGain → masterGain → destination
    const source = ctx.createBufferSource()
    source.buffer = this.getWindBuffer()
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = WIND_FILTER_FREQ
    filter.Q.value = WIND_FILTER_Q

    const windGain = ctx.createGain()
    windGain.gain.setValueAtTime(0.001, now) // 从接近 0 开始
    windGain.gain.exponentialRampToValueAtTime(1, now + FADE_DURATION)

    source.connect(filter)
    filter.connect(windGain)
    windGain.connect(this.masterGain!)

    source.start(now)

    this.windSource = source
    this.windFilter = filter
    this.windGain = windGain
    this._playing = true
  }

  /**
   * 暂停风声，3 秒淡出后停止节点。
   * 返回 Promise，在淡出完成后 resolve。
   */
  async stop(): Promise<void> {
    if (!this._playing || !this.ctx || !this.windGain || !this.windSource) {
      this._playing = false
      return
    }

    if (this._fading) return // 防止重复淡出

    this._fading = true
    const ctx = this.ctx
    const now = ctx.currentTime

    this.windGain.gain.setValueAtTime(this.windGain.gain.value, now)
    this.windGain.gain.exponentialRampToValueAtTime(0.001, now + FADE_DURATION)

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.stopImmediate()
        this._fading = false
        resolve()
      }, FADE_DURATION * 1000)
    })
  }

  /** 立即停止所有声音节点（无淡出），用于防叠声和清理 */
  stopImmediate(): void {
    try {
      this.windSource?.stop()
      this.windSource?.disconnect()
    } catch {
      // 已经停止的 source 再 stop 会抛异常，忽略
    }
    this.windGain?.disconnect()
    this.windFilter?.disconnect()
    this.windSource = null
    this.windGain = null
    this.windFilter = null
    this._playing = false
  }

  /** 设置主音量 (0-1) */
  setMasterVolume(value: number): void {
    if (!this.ctx || !this.masterGain) return
    const v = Math.max(0, Math.min(1, value))
    this.masterGain.gain.setValueAtTime(v, this.ctx.currentTime)
  }

  /** 获取风声 buffer（懒初始化，缓存复用） */
  private _windBuffer: AudioBuffer | null = null

  private getWindBuffer(): AudioBuffer {
    if (this._windBuffer) return this._windBuffer
    this._windBuffer = this.createWindBuffer()
    return this._windBuffer
  }

  /**
   * 合成风声：白噪声经低通滤波。
   * 生成 WIND_BUFFER_SECONDS 秒的 AudioBuffer。
   */
  private createWindBuffer(): AudioBuffer {
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const length = sr * WIND_BUFFER_SECONDS
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)

    // 白噪声基底
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }

    // 简单的移动平均做柔化，模拟风的"呼吸感"
    const windowSize = Math.floor(sr * 0.02) // 20ms 窗口
    const smoothed = new Float32Array(length)
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += data[i]
      if (i >= windowSize) sum -= data[i - windowSize]
      smoothed[i] = sum / Math.min(i + 1, windowSize)
    }

    // 写回 buffer
    for (let i = 0; i < length; i++) {
      data[i] = smoothed[i]
    }

    return buffer
  }

  /** 释放所有资源 */
  dispose(): void {
    this.stopImmediate()
    this._windBuffer = null
    this.masterGain?.disconnect()
    this.masterGain = null
    this.ctx?.close()
    this.ctx = null
  }
}

/** 全局单例 */
export const audioEngine = new AudioEngine()
