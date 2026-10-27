/**
 * SampleEngine — 竹间息 v2 发声层（真实录音采样）。
 *
 * 程序只决定「何时、何处、多大」（plan.ts，纯函数，按种子可复现）；
 * 声音全部来自 public/audio/v2 的真实录音（ab-demo/export_assets.py 导出）。
 * 定稿参考：ab-demo/ZenScape_R8_Cpp6_s64.mp3（Eric 认可的 C++6）。
 *
 * 信号链：
 *   竹叶 / 微风 / 水 的随机片段（等功率交叉）→ 各层包络 → bedSum
 *     → 大空间（真立体声卷积，含干声）→ bedOut（深静 + 结尾退场 + 开头淡入）→ natureGain ─┐
 *   古琴单音 → 空气低通 → 远处空间（单声道卷积，含干声）→ 音量 → 定位 ─┐                    │
 *   钟       → 微调音高 → 空气低通 → 远处空间（真立体声卷积）→ 音量 ──┴→ eventGain ───────┤
 *                                                                     masterGain → limiter → fadeGain → 输出
 *
 * 播放时用 10s 预调度（lookahead），只为即将发声的片段/音符建节点，放完即断开——手机上同时只有几条卷积在跑。
 * 离线渲染（OfflineAudioContext）一次性排完整段，用于和 Python 参考版做同一套门槛验收。
 */
import { AudioDiagnostics } from '../AudioDiagnostics'
import type { RecentEvent } from '../AudioEngine'
import type { SchedulerParams } from '../scheduler'
import { getModePreset } from '../soundscapes'
import type { Mode } from '../../types'
import { planSession, type Layer, type SessionPlan, type SoundscapeManifest, type TextureSegment, type QinNote, type BellStrike } from './plan'
import { V2_PRESETS } from './preset'
import { newSeed } from './rng'
import { buildSpaceIR } from './space'

/** 预调度窗口。后台标签页的定时器会被节流到每秒一次甚至更慢，留 20s 余量；同时在场的节点仍只有十来个 */
const LOOKAHEAD = 20 // 秒
const TICK_MS = 1000
const FADE_OUT = 3
/** 输出补偿：参考版整体约 -38 LUFS，手机上偏轻；默认主音量下抬 8dB，比例不变 */
const MAKEUP_DB = 8

const db = (x: number) => Math.pow(10, x / 20)

type Buffers = {
  bamboo: AudioBuffer
  breeze: AudioBuffer
  water: AudioBuffer
  bell: AudioBuffer
  qin: AudioBuffer[]
}

type Graph = {
  layerGain: Record<Layer, GainNode>
  bedSum: GainNode
  bedOut: GainNode
  nature: GainNode
  events: GainNode
  master: GainNode
  shelf: BiquadFilterNode
  limiter: DynamicsCompressorNode
  fade: GainNode
}

export class SampleEngine {
  /** v2 的阶段变化已经写进乐谱，SessionView 不再按阶段改滑杆 */
  readonly ownsDynamics = true

  private ctx: AudioContext | null = null
  private manifest: SoundscapeManifest | null = null
  private buffers: Buffers | null = null
  private loading: Promise<void> | null = null
  private graph: Graph | null = null
  private plan: SessionPlan | null = null

  private mode: Mode = 'meditate'
  private durationSec = 600
  private seed = newSeed()
  private offset = 0 // 会话内已播放的秒数（暂停时记住）
  private t0 = 0 // ctx 时间里的会话 0 秒
  private cursor = 0 // 已排到会话内的哪一秒
  private timer: ReturnType<typeof setInterval> | null = null
  private live: AudioNode[][] = []
  private pending: ReturnType<typeof setTimeout>[] = []
  private _playing = false
  private _fading = false
  private fadeToken = 0

  private _masterVolume = 0.48
  private _natureLevel = 0.62
  private _instrumentLevel = 0.42
  private _spatialLevel = 0.44
  private _brightness = 0.44
  private _ambientMuted = false
  private _eventsSolo = false
  private _recent: RecentEvent[] = []
  private _diagnostics: AudioDiagnostics | null = null

  get playing() {
    return this._playing
  }
  get diagnostics() {
    return this._diagnostics
  }
  get ambientMuted() {
    return this._ambientMuted
  }
  get eventsSolo() {
    return this._eventsSolo
  }
  get currentPlan(): SessionPlan | null {
    return this.plan
  }

  // ───────────────────────── 会话

  /** 新会话：新种子，从 0 秒开始。SessionView 挂载 / 再来一次时调用 */
  prepareSession(mode: Mode, durationSec: number, seed = newSeed()): void {
    this.stopImmediate()
    this.mode = mode
    this.durationSec = durationSec
    this.seed = seed
    this.offset = 0
    this.plan = null
    void this.load().catch(() => undefined)
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.plan = null // 下次播放按新模式重排（同一种子）
  }

  async play(): Promise<void> {
    await this.ensureRunning()
    await this.load()
    this.stopImmediate()
    const ctx = this.ctx!
    const M = this.manifest!
    if (!this.plan) this.plan = planSession(this.seed, this.durationSec, V2_PRESETS[this.mode], M)
    if (this.offset >= this.plan.dur - 0.5) this.offset = 0

    const g = this.buildGraph(ctx, ctx.destination)
    this.graph = g
    const now = ctx.currentTime + 0.12
    this.t0 = now - this.offset
    this.cursor = this.offset
    g.fade.gain.setValueAtTime(0, now)
    g.fade.gain.linearRampToValueAtTime(1, now + (this.offset > 0 ? 1.5 : 0.5))
    this.applyEnvelopes(g, this.plan, this.t0, this.offset)
    this.applyLevels(true)

    this._playing = true
    this.scheduleUntil(this.offset + LOOKAHEAD)
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (!this._playing || !this.ctx || !this.graph) {
      this._playing = false
      return
    }
    if (this._fading) return
    this._fading = true
    const ctx = this.ctx
    const now = ctx.currentTime
    this.offset = Math.min(this.plan?.dur ?? 0, now - this.t0)
    const fg = this.graph.fade.gain
    fg.cancelScheduledValues(now)
    fg.setValueAtTime(fg.value, now)
    fg.linearRampToValueAtTime(0, now + FADE_OUT)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const token = ++this.fadeToken
    setTimeout(() => {
      if (this.fadeToken !== token) return
      this.stopImmediate()
      this._fading = false
    }, FADE_OUT * 1000)
  }

  /** 立即停声，记住暂停位置；进度由 prepareSession 重置 */
  stopImmediate(): void {
    if (this.ctx && this.graph && this._playing && !this._fading) {
      this.offset = Math.min(this.plan?.dur ?? 0, this.ctx.currentTime - this.t0)
    }
    this.fadeToken++
    this._fading = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const id of this.pending) clearTimeout(id)
    this.pending = []
    for (const nodes of this.live) disconnectAll(nodes)
    this.live = []
    if (this.graph) {
      const g = this.graph
      disconnectAll([...Object.values(g.layerGain), g.bedSum, g.bedOut, g.nature, g.events, g.master, g.shelf, g.limiter, g.fade])
      this.graph = null
    }
    this._playing = false
  }

  dispose(): void {
    this.stopImmediate()
    this._diagnostics?.dispose()
    this._diagnostics = null
    void this.ctx?.close()
    this.ctx = null
    this.buffers = null
    this.loading = null
  }

  resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined)
  }

  // ───────────────────────── 滑杆（比例都相对于该模式的默认值：默认值 = 定稿声音）

  setMasterVolume(v: number): void {
    this._masterVolume = clamp01(v)
    this.applyLevels()
  }
  setNatureLevel(v: number): void {
    this._natureLevel = clamp01(v)
    this.applyLevels()
  }
  setInstrumentLevel(v: number): void {
    this._instrumentLevel = clamp01(v)
    this.applyLevels()
  }
  /** 空间：古琴左右散开的程度（0 = 居中，默认 = 定稿） */
  setSpatialLevel(v: number): void {
    this._spatialLevel = clamp01(v)
  }
  /** 明亮：3kHz 以上高架 ±6dB（默认 = 0dB = 定稿） */
  setBrightness(v: number): void {
    this._brightness = clamp01(v)
    this.applyLevels()
  }
  setReverbWet(): void {
    /* v2 的空间由定稿参数决定 */
  }
  setSchedulerParams(_p: Partial<SchedulerParams>): void {
    void _p /* v2 的事件由乐谱决定 */
  }

  muteAmbient(muted: boolean): void {
    this._ambientMuted = muted
    this.applyLevels()
  }
  soloEvents(solo: boolean): void {
    this._eventsSolo = solo
    this.muteAmbient(solo)
  }
  getRecentEvents(): RecentEvent[] {
    return [...this._recent]
  }

  /** dev：立即敲一下（用乐谱里的第一个参数） */
  triggerEvent(type: 'temple_bell' | 'guqin_harmonic'): void {
    if (!this.ctx || !this.graph || !this.plan || !this.buffers) return
    const when = this.ctx.currentTime + 0.05
    if (type === 'temple_bell' && this.plan.bells[0]) this.scheduleBell(this.ctx, this.graph, this.plan.bells[0], when)
    const n = this.plan.phrases[0]?.notes[0]
    if (type === 'guqin_harmonic' && n) this.scheduleQin(this.ctx, this.graph, n, when)
    this.record(type, 0, 0)
  }

  // ───────────────────────── 离线渲染（验收用）

  /** 用 OfflineAudioContext 把整段渲染出来；返回立体声 PCM。与实时播放走同一套节点与参数（滑杆取默认） */
  async renderOffline(
    seed: number,
    durSec: number,
    mode: Mode = 'meditate',
    sampleRate = 48000,
    layers: { bed?: boolean; events?: boolean } = {},
  ): Promise<{ plan: SessionPlan; buffer: AudioBuffer }> {
    const M = await fetchManifest()
    const ctx = new OfflineAudioContext(2, Math.ceil(durSec * sampleRate), sampleRate)
    const buffers = await decodeAll(ctx, M)
    const plan = planSession(seed, durSec, V2_PRESETS[mode], M)
    const saved = { b: this.buffers, m: this.manifest, mode: this.mode }
    this.buffers = buffers
    this.manifest = M
    this.mode = mode
    const def = getModePreset(mode).sound
    const levels = { master: def.masterVolume, nature: def.natureLevel, inst: def.instrumentLevel, sp: def.spatialLevel, br: def.brightness }
    const keep = [this._masterVolume, this._natureLevel, this._instrumentLevel, this._spatialLevel, this._brightness] as const
    ;[this._masterVolume, this._natureLevel, this._instrumentLevel, this._spatialLevel, this._brightness] = [levels.master, levels.nature, levels.inst, levels.sp, levels.br]
    try {
      const g = this.buildGraph(ctx, ctx.destination, true)
      g.fade.gain.value = 1
      this.applyEnvelopes(g, plan, 0, 0)
      this.setStaticLevels(g, true)
      if (layers.bed !== false) for (const s of plan.segments) this.scheduleSegment(ctx, g, s, s.at)
      if (layers.events !== false) {
        for (const p of plan.phrases) for (const n of p.notes) this.scheduleQin(ctx, g, n, n.at)
        for (const b of plan.bells) this.scheduleBell(ctx, g, b, b.at)
      }
      const buffer = await ctx.startRendering()
      return { plan, buffer }
    } finally {
      this.buffers = saved.b
      this.manifest = saved.m
      this.mode = saved.mode
      ;[this._masterVolume, this._natureLevel, this._instrumentLevel, this._spatialLevel, this._brightness] = keep
    }
  }

  // ───────────────────────── 内部：加载

  private async ensureRunning(): Promise<void> {
    if (!this.ctx) this.initContext()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
  }

  private initContext(): void {
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) throw new Error('当前浏览器不支持 Web Audio API，请尝试使用 Chrome 或 Safari')
    this.ctx = new Ctor()
    this._diagnostics = new AudioDiagnostics(this.ctx)
    this.ctx.addEventListener('statechange', () => {
      if (this.ctx && this.ctx.state === 'suspended' && this._playing) this.ctx.resume().catch(() => undefined)
    })
  }

  private load(): Promise<void> {
    if (this.buffers && this.manifest) return Promise.resolve()
    if (this.loading) return this.loading
    if (!this.ctx) this.initContext()
    const ctx = this.ctx!
    this.loading = (async () => {
      const M = await fetchManifest()
      this.buffers = await decodeAll(ctx, M)
      this.manifest = M
    })().catch((err) => {
      this.loading = null
      throw new Error(`声音素材加载失败：${err instanceof Error ? err.message : String(err)}`)
    })
    return this.loading
  }

  // ───────────────────────── 内部：图

  private buildGraph(ctx: BaseAudioContext, dest: AudioNode, offline = false): Graph {
    const M = this.manifest!
    const S = M.bed.space
    const fade = ctx.createGain()
    fade.gain.value = 0
    fade.connect(dest)
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -1
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.1
    limiter.connect(fade)
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 3000
    shelf.connect(limiter)
    const master = ctx.createGain()
    master.connect(shelf)
    const nature = ctx.createGain()
    nature.connect(master)
    const events = ctx.createGain()
    events.connect(master)

    const bedOut = ctx.createGain()
    bedOut.connect(nature)
    const conv = ctx.createConvolver()
    conv.normalize = false
    conv.buffer = buildSpaceIR(ctx, { rt60: S.rt60, wet: S.wet, dry: S.dry, predelay: S.predelay, lp: S.lp }, this.plan?.bedIrSeed ?? 1, 'stereo')
    conv.connect(bedOut)
    const bedSum = ctx.createGain()
    bedSum.connect(conv)
    const layerGain = {
      bamboo: ctx.createGain(),
      breeze: ctx.createGain(),
      water: ctx.createGain(),
    } as Record<Layer, GainNode>
    for (const k of Object.keys(layerGain) as Layer[]) layerGain[k].connect(bedSum)

    if (!offline && this._diagnostics) {
      this._diagnostics.attachProbe('master', master)
      this._diagnostics.attachProbe('ambientBus', nature)
      this._diagnostics.attachProbe('eventBus', events)
      this._diagnostics.attachProbe('limiter', limiter)
    }
    return { layerGain, bedSum, bedOut, nature, events, master, shelf, limiter, fade }
  }

  /** 把各层包络从会话 offset 秒起写成 AudioParam 曲线 */
  private applyEnvelopes(g: Graph, plan: SessionPlan, t0: number, offset: number): void {
    const M = this.manifest!
    const R = plan.ctrlRate
    const i0 = Math.min(plan.envDb.bamboo.length - 2, Math.floor(offset * R))
    const start = t0 + i0 / R
    const len = plan.envDb.bamboo.length - i0
    const dur = (len - 1) / R
    for (const layer of ['bamboo', 'breeze', 'water'] as Layer[]) {
      const restore = M.files[layer].gainDb
      const curve = new Float32Array(len)
      for (let k = 0; k < len; k++) curve[k] = db(plan.envDb[layer][i0 + k] + restore)
      g.layerGain[layer].gain.setValueCurveAtTime(curve, start, dur)
    }
    const out = new Float32Array(len)
    for (let k = 0; k < len; k++) out[k] = db(plan.bedOutDb[i0 + k])
    g.bedOut.gain.setValueCurveAtTime(out, start, dur)
  }

  private levels() {
    const def = getModePreset(this.mode).sound
    const ratio = (v: number, d: number) => (d > 0 ? v / d : 1)
    return {
      master: ratio(this._masterVolume, def.masterVolume) * db(MAKEUP_DB),
      nature: this._ambientMuted ? 0 : ratio(this._natureLevel, def.natureLevel),
      events: ratio(this._instrumentLevel, def.instrumentLevel),
      shelfDb: (this._brightness - def.brightness) * 12,
      spread: ratio(this._spatialLevel, def.spatialLevel),
    }
  }

  private setStaticLevels(g: Graph, offline: boolean): void {
    const L = this.levels()
    g.master.gain.value = offline ? 1 : L.master
    g.nature.gain.value = L.nature
    g.events.gain.value = L.events
    g.shelf.gain.value = offline ? 0 : L.shelfDb
  }

  private applyLevels(immediate = false): void {
    const g = this.graph
    const ctx = this.ctx
    if (!g || !ctx) return
    if (immediate) return this.setStaticLevels(g, false)
    const L = this.levels()
    const now = ctx.currentTime
    g.master.gain.setTargetAtTime(L.master, now, 0.08)
    g.nature.gain.setTargetAtTime(L.nature, now, 0.08)
    g.events.gain.setTargetAtTime(L.events, now, 0.08)
    g.shelf.gain.setTargetAtTime(L.shelfDb, now, 0.1)
  }

  // ───────────────────────── 内部：预调度

  private tick(): void {
    if (!this.ctx || !this._playing) return
    const pos = this.ctx.currentTime - this.t0
    this.scheduleUntil(pos + LOOKAHEAD)
  }

  private scheduleUntil(until: number): void {
    const ctx = this.ctx!
    const g = this.graph!
    const plan = this.plan!
    const from = this.cursor
    const to = Math.min(until, plan.dur)
    if (to <= from) return
    const at = (t: number) => this.t0 + t
    const now = ctx.currentTime
    for (const s of plan.segments) {
      const end = s.at + s.len
      // 已经开始但还没放完的片段（续播时，或定时器被节流、排程落后时）也要接上：从当前位置切进去
      if ((s.at >= from && s.at < to) || (s.at < from && end > from && from === this.offset)) {
        this.scheduleSegment(ctx, g, s, at(s.at), Math.max(0, now + 0.02 - at(s.at)))
      }
    }
    // 排程落后（标签页长时间被冻结）时，已经错过的钟和琴不补敲，免得一下子全挤在一起
    const late = (t: number) => at(t) < now - 0.25
    for (const p of plan.phrases) {
      for (const n of p.notes) {
        if (n.at >= from && n.at < to && !late(n.at)) {
          this.scheduleQin(ctx, g, n, at(n.at))
          this.recordAt(at(n.at), 'guqin_harmonic', n.pan)
        }
      }
    }
    for (const b of plan.bells) {
      if (b.at >= from && b.at < to && !late(b.at)) {
        this.scheduleBell(ctx, g, b, at(b.at))
        this.recordAt(at(b.at), 'temple_bell', 0)
      }
    }
    this.cursor = to
  }

  private track(nodes: AudioNode[], src: AudioScheduledSourceNode, extraSec: number): void {
    if (!(this.ctx instanceof AudioContext)) return
    this.live.push(nodes)
    src.onended = () => {
      const id = setTimeout(() => {
        disconnectAll(nodes)
        this.live = this.live.filter((x) => x !== nodes)
        this.pending = this.pending.filter((x) => x !== id)
      }, extraSec * 1000)
      this.pending.push(id)
    }
  }

  private scheduleSegment(ctx: BaseAudioContext, g: Graph, s: TextureSegment, when: number, skip = 0): void {
    const buf = this.buffers![s.layer]
    const src = ctx.createBufferSource()
    src.buffer = buf
    const env = ctx.createGain()
    const steps = 64
    const fin = new Float32Array(steps)
    const fout = new Float32Array(steps)
    for (let k = 0; k < steps; k++) {
      fin[k] = Math.sin(((k / (steps - 1)) * Math.PI) / 2)
      fout[k] = Math.cos(((k / (steps - 1)) * Math.PI) / 2)
    }
    const xf = Math.min(s.xf, s.len / 2)
    const t = when + skip
    const outAt = when + s.len - xf
    if (skip <= 0) {
      env.gain.value = 0
      env.gain.setValueCurveAtTime(fin, when, xf)
      env.gain.setValueCurveAtTime(fout, outAt, xf)
    } else if (t < outAt) {
      // 从中间切进来（续播 / 排程落后）：先接上当时的淡入值，再照常淡出
      const v = skip < xf ? Math.sin(((skip / xf) * Math.PI) / 2) : 1
      env.gain.setValueAtTime(v, t)
      if (skip < xf) env.gain.linearRampToValueAtTime(1, when + xf)
      env.gain.setValueCurveAtTime(fout, outAt, xf)
    } else {
      // 已在淡出段里
      env.gain.setValueAtTime(Math.cos((((t - outAt) / xf) * Math.PI) / 2), t)
      env.gain.linearRampToValueAtTime(0, when + s.len)
    }
    const nodes: AudioNode[] = [src, env]
    if (s.swapLR) {
      const split = ctx.createChannelSplitter(2)
      const merge = ctx.createChannelMerger(2)
      src.connect(split)
      split.connect(merge, 0, 1)
      split.connect(merge, 1, 0)
      merge.connect(env)
      nodes.push(split, merge)
    } else {
      src.connect(env)
    }
    env.connect(g.layerGain[s.layer])
    src.start(t, s.offset + skip, Math.max(0.01, s.len - skip))
    this.track(nodes, src, 0.2)
  }

  private scheduleQin(ctx: BaseAudioContext, g: Graph, n: QinNote, when: number): void {
    const P = V2_PRESETS[this.mode].qin.far
    const M = this.manifest!
    const src = ctx.createBufferSource()
    src.buffer = this.buffers!.qin[n.clip]
    src.playbackRate.value = Math.pow(2, n.cents / 1200)
    const lp1 = ctx.createBiquadFilter()
    const lp2 = ctx.createBiquadFilter()
    for (const f of [lp1, lp2]) {
      f.type = 'lowpass'
      f.frequency.value = n.airLp
      f.Q.value = Math.SQRT1_2
    }
    const conv = ctx.createConvolver()
    conv.normalize = false
    conv.channelCount = 1
    conv.channelCountMode = 'explicit'
    conv.buffer = buildSpaceIR(ctx, { rt60: n.rt60, wet: P.wet, dry: P.dry, predelay: P.predelay, lp: P.lp }, n.irSeed, 'mono')
    const gain = ctx.createGain()
    // Python place()：单声道 × cos/sin × √2 → 居中时每声道等于原电平
    gain.gain.value = db(n.gainDb + M.qin.clips[n.clip].gainDb) * Math.SQRT2
    gain.channelCount = 1
    gain.channelCountMode = 'explicit'
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, n.pan * this.levels().spread))
    src.connect(lp1)
    lp1.connect(lp2)
    lp2.connect(conv)
    conv.connect(gain)
    gain.connect(pan)
    pan.connect(g.events)
    src.start(when)
    this.track([src, lp1, lp2, conv, gain, pan], src, n.rt60 + 1.5)
  }

  private scheduleBell(ctx: BaseAudioContext, g: Graph, b: BellStrike, when: number): void {
    const P = V2_PRESETS[this.mode].bell.far
    const M = this.manifest!
    const src = ctx.createBufferSource()
    src.buffer = this.buffers!.bell
    src.playbackRate.value = Math.pow(2, b.cents / 1200)
    const lp1 = ctx.createBiquadFilter()
    const lp2 = ctx.createBiquadFilter()
    for (const f of [lp1, lp2]) {
      f.type = 'lowpass'
      f.frequency.value = b.lp
      f.Q.value = Math.SQRT1_2
    }
    const conv = ctx.createConvolver()
    conv.normalize = false
    conv.buffer = buildSpaceIR(ctx, { rt60: b.rt60, wet: P.wet, dry: P.dry, predelay: P.predelay, lp: P.rlp }, b.irSeed, 'stereo')
    const gain = ctx.createGain()
    gain.gain.value = db(b.gainDb + M.files.bell.gainDb)
    src.connect(lp1)
    lp1.connect(lp2)
    lp2.connect(conv)
    conv.connect(gain)
    gain.connect(g.events)
    src.start(when)
    this.track([src, lp1, lp2, conv, gain], src, b.rt60 + 1.5)
  }

  private recordAt(when: number, type: RecentEvent['type'], pan: number): void {
    if (!this.ctx) return
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000)
    const id = setTimeout(() => {
      this.pending = this.pending.filter((x) => x !== id)
      this.record(type, pan, ms)
    }, ms)
    this.pending.push(id)
  }

  private record(type: RecentEvent['type'], pan: number, _delay: number): void {
    void _delay
    this._recent.unshift({ time: performance.now(), type, volume: this._instrumentLevel, pan })
    if (this._recent.length > 20) this._recent.length = 20
  }
}

// ───────────────────────── 工具

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function disconnectAll(nodes: AudioNode[]) {
  for (const n of nodes) {
    try {
      if (n instanceof AudioScheduledSourceNode) n.stop()
    } catch {
      /* 已停 */
    }
    try {
      n.disconnect()
    } catch {
      /* 已断 */
    }
  }
}

const BASE = `${import.meta.env.BASE_URL}audio/v2/`

async function fetchManifest(): Promise<SoundscapeManifest> {
  const r = await fetch(`${BASE}soundscape.json`)
  if (!r.ok) throw new Error(`soundscape.json ${r.status}`)
  return (await r.json()) as SoundscapeManifest
}

async function decode(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  const r = await fetch(BASE + file)
  if (!r.ok) throw new Error(`${file} ${r.status}`)
  return ctx.decodeAudioData(await r.arrayBuffer())
}

async function decodeAll(ctx: BaseAudioContext, M: SoundscapeManifest): Promise<Buffers> {
  const [bamboo, breeze, water, bell, ...qin] = await Promise.all([
    decode(ctx, M.files.bamboo.file),
    decode(ctx, M.files.breeze.file),
    decode(ctx, M.files.water.file),
    decode(ctx, M.files.bell.file),
    ...M.qin.clips.map((c) => decode(ctx, c.file)),
  ])
  return { bamboo, breeze, water, bell, qin }
}

export const sampleEngine = new SampleEngine()
