/**
 * 大空间（移植自 ab-demo/render_r4.py 的 space() 与 render_b.py 的 ir()）。
 *
 * Python：out = dry·x + Σ 早期反射(LP) + wet · HP250( x ⊛ 噪声尾 )，尾巴有预延迟。
 * 这里把这几项全部写进一条脉冲响应，交给一个 ConvolverNode：
 *   - 'stereo'：4 声道真立体声 IR（LL/LR/RL/RR），翻转的早期反射走交叉声道
 *   - 'mono'  ：单声道 IR（古琴：Python 在 place() 里把整条混响合成单声道再定位）
 * 滤波都做成零相位（正反各跑一次 2 阶 Butterworth），和 scipy 的 sosfiltfilt 一致。
 */
import { mulberry32, normal } from './rng'

export interface SpaceParams {
  rt60: number
  wet: number
  dry: number
  predelay: number
  lp: number
}

const TAPS: readonly [number, number, boolean][] = [
  [0.031, 0.22, false],
  [0.053, 0.17, true],
  [0.089, 0.13, false],
  [0.137, 0.1, true],
]

type Coefs = [number, number, number, number, number]

function biquad(kind: 'lowpass' | 'highpass', fc: number, sr: number): Coefs {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  if (kind === 'lowpass') {
    const b1 = (1 - cos) / a0
    return [b1 / 2, b1, b1 / 2, (-2 * cos) / a0, (1 - alpha) / a0]
  }
  const b1 = -(1 + cos) / a0
  return [-b1 / 2, b1, -b1 / 2, (-2 * cos) / a0, (1 - alpha) / a0]
}

function runBiquad(x: Float32Array, c: Coefs, reverse: boolean): void {
  const [b0, b1, b2, a1, a2] = c
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  const n = x.length
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k
    const v = x[i]
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = v
    y2 = y1
    y1 = y
    x[i] = y
  }
}

/** 零相位 2 阶 Butterworth（= scipy butter(2) + sosfiltfilt） */
export function filtfilt(x: Float32Array, kind: 'lowpass' | 'highpass', fc: number, sr: number): void {
  const c = biquad(kind, fc, sr)
  runBiquad(x, c, false)
  runBiquad(x, c, true)
}

/** 把一段（已低通的）冲激放进 IR 的 at 位置 */
function addImpulse(ir: Float32Array, at: number, gain: number, kernel: Float32Array, center: number): void {
  for (let k = 0; k < kernel.length; k++) {
    const i = at + k - center
    if (i >= 0 && i < ir.length) ir[i] += gain * kernel[k]
  }
}

export function buildSpaceIR(
  ctx: BaseAudioContext,
  p: SpaceParams,
  seed: number,
  layout: 'stereo' | 'mono',
): AudioBuffer {
  const sr = ctx.sampleRate
  const tailLen = Math.floor((p.rt60 + 1.0) * sr)
  const pd = Math.floor(p.predelay * sr)
  const len = Math.max(pd + tailLen, Math.floor(0.2 * sr))
  const rng = mulberry32(seed)

  // 噪声尾（两声道独立），指数衰减 → 低通 → 前 12ms 置零 → 两声道合计能量归一
  const tail = [new Float32Array(tailLen), new Float32Array(tailLen)]
  for (const ch of tail) {
    for (let i = 0; i < tailLen; i++) ch[i] = normal(rng) * Math.exp((-6.91 * (i / sr)) / p.rt60)
    filtfilt(ch, 'lowpass', p.lp, sr)
    ch.fill(0, 0, Math.floor(0.012 * sr))
  }
  let e = 0
  for (const ch of tail) for (let i = 0; i < tailLen; i++) e += ch[i] * ch[i]
  const norm = 1 / Math.sqrt(e + 1e-20)
  for (const ch of tail) {
    for (let i = 0; i < tailLen; i++) ch[i] *= norm
    // 尾巴去掉 250Hz 以下（手机放不出，只会糊）。对 IR 滤波 = 对输出滤波
    filtfilt(ch, 'highpass', 250, sr)
  }

  // 早期反射：低通后的冲激（零相位，所以以中心对齐）
  const kLen = 2 * Math.floor(0.004 * sr) + 1
  const kernel = new Float32Array(kLen)
  const center = (kLen - 1) / 2
  kernel[center] = 1
  filtfilt(kernel, 'lowpass', p.lp, sr)

  if (layout === 'mono') {
    const ir = ctx.createBuffer(1, len, sr)
    const d = ir.getChannelData(0)
    d[0] += p.dry
    for (const [dt, g] of TAPS) addImpulse(d, Math.floor(dt * sr), g, kernel, center)
    for (let i = 0; i < tailLen && pd + i < len; i++) d[pd + i] += (p.wet * (tail[0][i] + tail[1][i])) / 2
    return ir
  }

  // 真立体声：0 = L→L，1 = L→R，2 = R→L，3 = R→R
  const ir = ctx.createBuffer(4, len, sr)
  const LL = ir.getChannelData(0)
  const LR = ir.getChannelData(1)
  const RL = ir.getChannelData(2)
  const RR = ir.getChannelData(3)
  LL[0] += p.dry
  RR[0] += p.dry
  for (const [dt, g, flip] of TAPS) {
    const at = Math.floor(dt * sr)
    if (flip) {
      addImpulse(LR, at, g, kernel, center)
      addImpulse(RL, at, g, kernel, center)
    } else {
      addImpulse(LL, at, g, kernel, center)
      addImpulse(RR, at, g, kernel, center)
    }
  }
  for (let i = 0; i < tailLen && pd + i < len; i++) {
    LL[pd + i] += p.wet * tail[0][i]
    RR[pd + i] += p.wet * tail[1][i]
  }
  return ir
}

/**
 * 同一条真立体声 IR，拆成「直通 + 交叉」两条，便宜一半。
 *
 * 4 声道 IR 里 LR/RL 只有两个翻转的早期反射（≤ 0.15s），却要按整条 IR 长度（数秒）做 FFT 卷积，
 * 一半算力花在零上。拆开后：
 *   - direct：2 声道 [LL, RR]，各声道自卷（Chrome/Safari 对 2 声道 IR + 2 声道输入就是这样处理的）
 *   - cross ：2 声道 [LR, RL] 截到最后一个非零样本，输入左右互换后再卷
 * outL = inL⊛LL + inR⊛RL，outR = inR⊛RR + inL⊛LR —— 和 4 声道 IR 数学上相同。
 */
export function splitTrueStereoIR(ctx: BaseAudioContext, ir: AudioBuffer): { direct: AudioBuffer; cross: AudioBuffer } {
  if (ir.numberOfChannels !== 4) throw new Error('splitTrueStereoIR: need a 4-channel IR')
  const sr = ir.sampleRate
  const direct = ctx.createBuffer(2, ir.length, sr)
  direct.copyToChannel(ir.getChannelData(0), 0)
  direct.copyToChannel(ir.getChannelData(3), 1)
  const LR = ir.getChannelData(1)
  const RL = ir.getChannelData(2)
  let last = 0
  for (let i = ir.length - 1; i >= 0; i--) {
    if (LR[i] !== 0 || RL[i] !== 0) {
      last = i
      break
    }
  }
  const cross = ctx.createBuffer(2, Math.max(128, last + 1), sr)
  // 输入已左右互换：通道 0 拿到的是 inR，要乘 RL 进 outL；通道 1 拿到 inL，乘 LR 进 outR
  cross.copyToChannel(RL.subarray(0, cross.length), 0)
  cross.copyToChannel(LR.subarray(0, cross.length), 1)
  return { direct, cross }
}

/** 把 input 接进拆开的真立体声混响，结果汇到 output。返回新建的节点，便于事后断开 */
export function connectTrueStereo(
  ctx: BaseAudioContext,
  input: AudioNode,
  ir: AudioBuffer,
  output: AudioNode,
): AudioNode[] {
  const { direct, cross } = splitTrueStereoIR(ctx, ir)
  const d = ctx.createConvolver()
  d.normalize = false
  d.buffer = direct
  const split = ctx.createChannelSplitter(2)
  const merge = ctx.createChannelMerger(2)
  const c = ctx.createConvolver()
  c.normalize = false
  c.buffer = cross
  // 2 声道 IR 的卷积器默认 channelCountMode = clamped-max，单声道输入会被上混成 L=R，与 4 声道路径一致
  input.connect(d)
  d.connect(output)
  input.connect(split)
  split.connect(merge, 0, 1)
  split.connect(merge, 1, 0)
  merge.connect(c)
  c.connect(output)
  return [d, split, merge, c]
}
