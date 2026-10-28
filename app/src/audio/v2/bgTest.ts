/**
 * 真机对照测试（?bgtest=1）：后台断续到底卡在哪一层。
 * 每个按钮只换一个变量；放着声音切到后台听 1 分钟，记下哪几个断。
 *   A  <audio> 播一段录音            —— 浏览器媒体通道，最不容易被系统掐
 *   B  Web Audio 只播一段录音         —— 几乎不耗 CPU 的 Web Audio
 *   C  完整引擎（现在线上的做法）       —— Web Audio + 实时卷积混响
 *   D  完整引擎 → <audio> 播出         —— 计算不变，出口换成媒体通道
 *   E  先离线渲染 90 秒 → <audio> 播   —— 实时零计算，走媒体通道
 *   F  完整引擎，开播时一次排完 10 分钟 —— 不再依赖网页定时器
 *   G  完整引擎 + 一个几乎无声的 <audio> 循环 —— 让系统当成「正在播放音乐」
 *   H  流式预渲染：分段离线渲好，实时只放现成的 buffer（和 B 一样轻）
 *   I  H + 几乎无声的 <audio>（状态栏显示播放）
 */
import { sampleEngine } from './SampleEngine'

const BASE = `${import.meta.env.BASE_URL}audio/v2/`
type Stats = { underrunEvents: number; underrunDuration: number }

let stopCurrent: (() => void) | null = null
let statCtx: AudioContext | null = null
let label = '—'

function wav(buf: AudioBuffer): Blob {
  const n = buf.length
  const L = buf.getChannelData(0)
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L
  const pcm = new Int16Array(n * 2)
  for (let i = 0; i < n; i++) {
    pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)))
    pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)))
  }
  const h = new DataView(new ArrayBuffer(44))
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)) }
  const sr = buf.sampleRate
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ')
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 2, true); h.setUint32(24, sr, true)
  h.setUint32(28, sr * 4, true); h.setUint16(32, 4, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.byteLength, true)
  return new Blob([h, pcm], { type: 'audio/wav' })
}

function mediaSession(title: string) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: '竹间息 后台测试' })
}

async function playElement(src: string, title: string, loop: boolean): Promise<() => void> {
  const a = new Audio(src)
  a.loop = loop
  await a.play()
  mediaSession(title)
  return () => { a.pause(); a.removeAttribute('src'); a.load() }
}

/** 10 秒、-80dB 的极轻噪声 WAV（全零可能被当成静音不给媒体通知） */
function quietLoop(): string {
  const sr = 8000
  const ctx = new OfflineAudioContext(2, sr * 10, sr)
  const b = ctx.createBuffer(2, sr * 10, sr)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 1e-4
  }
  return URL.createObjectURL(wav(b))
}

async function engine(lookahead: number, stream = false): Promise<void> {
  sampleEngine.setStreamMode(stream)
  sampleEngine.setMediaElementOutput(false)
  sampleEngine.setLookahead(lookahead)
  sampleEngine.prepareSession('meditate', 600, 'mid')
  await sampleEngine.play()
  sampleEngine.resetTickStats()
  statCtx = sampleEngine.context
}

const TESTS: Record<string, { name: string; run: (set: (s: string) => void) => Promise<() => void> }> = {
  A: {
    name: '<audio> 录音',
    run: () => playElement(`${BASE}breeze.mp3`, 'A 录音', true),
  },
  B: {
    name: 'Web Audio 录音',
    run: async () => {
      const ctx = new AudioContext({ latencyHint: 'playback' })
      await ctx.resume()
      const buf = await ctx.decodeAudioData(await (await fetch(`${BASE}breeze.mp3`)).arrayBuffer())
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.connect(ctx.destination)
      s.start()
      statCtx = ctx
      return () => { s.stop(); void ctx.close() }
    },
  },
  C: {
    name: '完整引擎',
    run: async () => {
      await engine(20)
      return () => sampleEngine.stopImmediate()
    },
  },
  D: {
    name: '引擎 → <audio>',
    run: async () => {
      sampleEngine.setMediaElementOutput(true)
      sampleEngine.setLookahead(20)
      sampleEngine.prepareSession('meditate', 600, 'mid')
      await sampleEngine.play()
      sampleEngine.resetTickStats()
      statCtx = sampleEngine.context
      mediaSession('D 引擎→audio')
      return () => { sampleEngine.stopImmediate(); sampleEngine.setMediaElementOutput(false) }
    },
  },
  F: {
    name: '引擎 一次排完',
    run: async () => {
      await engine(100000)
      return () => { sampleEngine.stopImmediate(); sampleEngine.setLookahead(20) }
    },
  },
  G: {
    name: '引擎 + 静音<audio>',
    run: async () => {
      const url = quietLoop()
      const stopEl = await playElement(url, 'G 竹间息', true)
      await engine(20)
      return () => { sampleEngine.stopImmediate(); stopEl(); URL.revokeObjectURL(url) }
    },
  },
  H: {
    name: '流式预渲染',
    run: async () => {
      await engine(20, true)
      return () => { sampleEngine.stopImmediate(); sampleEngine.setStreamMode(false) }
    },
  },
  I: {
    name: '流式 + 静音<audio>',
    run: async () => {
      const url = quietLoop()
      const stopEl = await playElement(url, 'I 竹间息', true)
      await engine(20, true)
      return () => { sampleEngine.stopImmediate(); sampleEngine.setStreamMode(false); stopEl(); URL.revokeObjectURL(url) }
    },
  },
  E: {
    name: '离线 90s → <audio>',
    run: async (set) => {
      set('E 渲染中…（手机上可能要十几秒）')
      const t = performance.now()
      const { buffer } = await sampleEngine.renderOffline(64, 90, 'meditate', 48000, {}, 'mid')
      set(`E 渲染用了 ${((performance.now() - t) / 1000).toFixed(1)}s`)
      const url = URL.createObjectURL(wav(buffer))
      const stop = await playElement(url, 'E 离线', false)
      return () => { stop(); URL.revokeObjectURL(url) }
    },
  },
}

export function startBgTest(): void {
  const box = document.createElement('div')
  box.style.cssText =
    'position:fixed;inset:auto 8px 8px 8px;z-index:9999;font:13px/1.4 system-ui,sans-serif;color:#e8f2ea;' +
    'background:rgba(8,12,10,.92);border:1px solid #2c3a31;border-radius:8px;padding:10px'
  const status = document.createElement('div')
  status.setAttribute('role', 'status')
  status.style.cssText = 'font:12px/1.4 ui-monospace,monospace;white-space:pre;margin-top:8px'
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'
  const set = (s: string) => { label = s }

  const mk = (text: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.style.cssText = 'padding:8px 10px;border-radius:6px;border:1px solid #4a5d50;background:#16201a;color:inherit;font:inherit'
    b.addEventListener('click', onClick)
    row.appendChild(b)
  }
  for (const [k, t] of Object.entries(TESTS)) {
    mk(`${k} ${t.name}`, async () => {
      stopCurrent?.()
      stopCurrent = null
      statCtx = null
      set(`${k} 启动中…`)
      try {
        stopCurrent = await t.run(set)
        set(`${k} ${t.name} 播放中`)
        acc.fg = { n: 0, ms: 0, sec: 0 }
        acc.bg = { n: 0, ms: 0, sec: 0 }
        last = null
      } catch (e) {
        set(`${k} 失败：${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }
  mk('停', () => { stopCurrent?.(); stopCurrent = null; statCtx = null; set('已停') })
  box.append(row, status)
  document.body.appendChild(box)

  const acc = { fg: { n: 0, ms: 0, sec: 0 }, bg: { n: 0, ms: 0, sec: 0 } }
  let last: Stats | null = null
  let lastT = performance.now()
  let lastHidden = document.hidden
  const tick = () => {
    const now = performance.now()
    const s = (statCtx as (AudioContext & { playbackStats?: Stats }) | null)?.playbackStats
    if (s) {
      if (last) {
        const b = lastHidden ? acc.bg : acc.fg
        b.n += s.underrunEvents - last.underrunEvents
        b.ms += (s.underrunDuration - last.underrunDuration) * 1000
        b.sec += (now - lastT) / 1000
      }
      last = { underrunEvents: s.underrunEvents, underrunDuration: s.underrunDuration }
    }
    lastT = now
    lastHidden = document.hidden
    const r = (k: 'fg' | 'bg') => `${k === 'fg' ? '前台' : '后台'} ${acc[k].sec.toFixed(0)}s 掉块 ${acc[k].n} 次 / ${acc[k].ms.toFixed(0)}ms`
    const t = sampleEngine.tickStats
    const ss = sampleEngine.streamStats
    const pct = (w: number, a: number) => (a > 0 ? `${Math.round((100 * w) / a)}%` : '—')
    const str = /^[HI] /.test(label)
      ? `\n渲染耗时/时长 前台 ${pct(ss.fgWall, ss.fgAudio)}（${ss.fgAudio.toFixed(0)}s） 后台 ${pct(ss.bgWall, ss.bgAudio)}（${ss.bgAudio.toFixed(0)}s）\n最小余量 ${Number.isFinite(ss.minLead) ? ss.minLead.toFixed(1) : '—'}s，迟到 ${ss.late} 段`
      : ''
    const eng = /^[CDFG] /.test(label)
      ? `\n定时器最大间隔 ${t.maxGap.toFixed(1)}s，最小余量 ${Number.isFinite(t.minLead) ? t.minLead.toFixed(1) : '—'}s，断粮 ${t.starved} 次`
      : ''
    status.textContent = `${label}\n${statCtx ? `${r('fg')}\n${r('bg')}` : '（这一项没有掉块统计，靠耳朵）'}${eng}${str}`
  }
  document.addEventListener('visibilitychange', tick)
  setInterval(tick, 1000)
}
