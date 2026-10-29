/**
 * 真机后台播放回归测试（?bgtest=1）。放着声音切到后台听 1 分钟，记下哪几个断。
 *   A  <audio> 播一段录音        —— 浏览器媒体通道，对照组
 *   B  Web Audio 只播一段录音     —— 几乎不耗 CPU 的 Web Audio，对照组
 *   C  实时引擎（旧做法）          —— 播放时实时算卷积混响；OPPO 安卓 Chrome 后台会断
 *   H  流式预渲染（现在的默认）     —— 分段离线渲好，实时只放现成的 buffer
 * 2026-10 真机结果：A、B、H 不断，C 断（且 Chrome playbackStats 记不到这种断）。
 */
import { sampleEngine } from './SampleEngine'

const BASE = `${import.meta.env.BASE_URL}audio/v2/`
type Stats = { underrunEvents: number; underrunDuration: number }

let stopCurrent: (() => void) | null = null
let statCtx: AudioContext | null = null
let label = '—'

async function engine(stream: boolean): Promise<void> {
  sampleEngine.setStreamMode(stream)
  sampleEngine.prepareSession('meditate', 600, 'mid')
  await sampleEngine.play()
  statCtx = sampleEngine.context
}

const TESTS: Record<string, { name: string; run: () => Promise<() => void> }> = {
  A: {
    name: '<audio> 录音',
    run: async () => {
      const a = new Audio(`${BASE}breeze.mp3`)
      a.loop = true
      await a.play()
      return () => { a.pause(); a.removeAttribute('src'); a.load() }
    },
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
    name: '实时引擎（旧）',
    run: async () => {
      await engine(false)
      return () => { sampleEngine.stopImmediate(); sampleEngine.setStreamMode(true) }
    },
  },
  H: {
    name: '流式预渲染（默认）',
    run: async () => {
      await engine(true)
      return () => sampleEngine.stopImmediate()
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

  const acc = { fg: { n: 0, ms: 0, sec: 0 }, bg: { n: 0, ms: 0, sec: 0 } }
  let last: Stats | null = null

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
      label = `${k} 启动中…`
      try {
        stopCurrent = await t.run()
        label = `${k} ${t.name} 播放中`
        acc.fg = { n: 0, ms: 0, sec: 0 }
        acc.bg = { n: 0, ms: 0, sec: 0 }
        last = null
      } catch (e) {
        label = `${k} 失败：${e instanceof Error ? e.message : String(e)}`
      }
    })
  }
  mk('停', () => { stopCurrent?.(); stopCurrent = null; statCtx = null; label = '已停' })
  box.append(row, status)
  document.body.appendChild(box)

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
    const ss = sampleEngine.streamStats
    const pct = (w: number, a: number) => (a > 0 ? `${Math.round((100 * w) / a)}%` : '—')
    const str = label.startsWith('H ')
      ? `\n渲染耗时/时长 前台 ${pct(ss.fgWall, ss.fgAudio)}（${ss.fgAudio.toFixed(0)}s） 后台 ${pct(ss.bgWall, ss.bgAudio)}（${ss.bgAudio.toFixed(0)}s）\n最小余量 ${Number.isFinite(ss.minLead) ? ss.minLead.toFixed(1) : '—'}s，迟到 ${ss.late} 段`
      : ''
    status.textContent = `${label}\n${statCtx ? `${r('fg')}\n${r('bg')}` : '（这一项没有掉块统计，靠耳朵）'}${str}`
  }
  document.addEventListener('visibilitychange', tick)
  setInterval(tick, 1000)
}
