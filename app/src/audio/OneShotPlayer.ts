/**
 * OneShotPlayer — ZenScape M3
 *
 * 合成一次性声音事件：
 * - temple_bell：远寺钟声（衰减正弦 + 泛音，长尾音）
 * - guqin_harmonic：古琴泛音（拨弦感，快起中衰）
 *
 * 每次触发随机音量、声像、音高微偏移，避免机械感。
 */

type OneShotType = 'temple_bell' | 'guqin_harmonic'

interface OneShotOptions {
  /** 音量范围 [min, max]，默认 [0.15, 0.4] */
  volumeRange?: [number, number]
  /** 声像范围 [min, max]，默认 [-0.6, 0.6] */
  panRange?: [number, number]
}

const DEFAULT_OPTIONS: Required<OneShotOptions> = {
  volumeRange: [0.12, 0.35],
  panRange: [-0.6, 0.6],
}

export class OneShotPlayer {
  private ctx: AudioContext
  private masterGain: GainNode

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx
    this.masterGain = masterGain
  }

  /** 触发一个一次性声音事件 */
  play(type: OneShotType, opts?: OneShotOptions): void {
    const options = { ...DEFAULT_OPTIONS, ...opts }
    const now = this.ctx.currentTime
    const volume = rand(options.volumeRange[0], options.volumeRange[1])
    const pan = rand(options.panRange[0], options.panRange[1])

    if (type === 'temple_bell') {
      this.synthBell(now, volume, pan)
    } else {
      this.synthGuqin(now, volume, pan)
    }
  }

  /**
   * 钟声合成：
   * - 基频 220Hz 衰减正弦（5 秒尾音）
   * - 二次泛音 440Hz（较快衰减）
   * - 三次泛音 660Hz（更快衰减）
   * - 整体通过 panner 定位声像
   */
  private synthBell(now: number, volume: number, pan: number): void {
    const ctx = this.ctx

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    panner.connect(this.masterGain)

    // 基频
    this.addDecayingTone(panner, 220, 'sine', volume, 6.0, now)
    // 泛音
    this.addDecayingTone(panner, 440, 'sine', volume * 0.3, 3.5, now)
    this.addDecayingTone(panner, 660, 'sine', volume * 0.12, 2.0, now)

    // 轻微的打击瞬态（短暂的宽带噪声 burst）
    this.addTransient(panner, volume * 0.15, now)
  }

  /**
   * 古琴泛音合成：
   * - 单音拨弦感（快起中衰）
   * - 基频 ~520Hz（A4 附近泛音位置）
   * - 轻微的二倍频
   */
  private synthGuqin(now: number, volume: number, pan: number): void {
    const ctx = this.ctx

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    panner.connect(this.masterGain)

    // 主泛音
    const baseFreq = rand(480, 580) // 随机微偏移
    this.addPluckedTone(panner, baseFreq, volume, 3.0, now)
    // 轻微二倍频
    this.addPluckedTone(panner, baseFreq * 2, volume * 0.15, 1.5, now)
  }

  /** 衰减正弦音 */
  private addDecayingTone(
    dest: AudioNode,
    freq: number,
    type: OscillatorType,
    volume: number,
    decay: number,
    now: number,
  ): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay)

    osc.connect(gain)
    gain.connect(dest)
    osc.start(now)
    osc.stop(now + decay + 0.1)
  }

  /** 拨弦音（快起中衰） */
  private addPluckedTone(
    dest: AudioNode,
    freq: number,
    volume: number,
    decay: number,
    now: number,
  ): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const gain = ctx.createGain()
    // 快起：10ms 内到达峰值
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01)
    // 中衰
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay)

    osc.connect(gain)
    gain.connect(dest)
    osc.start(now)
    osc.stop(now + decay + 0.1)
  }

  /** 打击瞬态（短暂噪声 burst，模拟钟槌敲击） */
  private addTransient(dest: AudioNode, volume: number, now: number): void {
    const ctx = this.ctx
    const duration = 0.03
    const sr = ctx.sampleRate
    const length = Math.floor(sr * duration)
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) // 线性衰减
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    source.connect(gain)
    gain.connect(dest)
    source.start(now)
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
