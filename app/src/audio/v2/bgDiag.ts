/**
 * 真机诊断：URL 带 ?diag=1 时，在页面角落显示音频回调的掉块（underrun）统计，
 * 并分「前台 / 后台」各记一份，用于手机上验证后台断续是否消失。
 * 仅读 AudioContext.playbackStats（Chrome 才有）；不支持时显示 n/a。
 */
type Stats = { underrunEvents: number; underrunDuration: number }

export function startBgDiag(getCtx: () => AudioContext | null): void {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:9999;font:11px/1.35 ui-monospace,monospace;' +
    'color:#cfe;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre'
  document.body.appendChild(el)

  const acc = { fg: { n: 0, ms: 0, sec: 0 }, bg: { n: 0, ms: 0, sec: 0 } }
  let last: Stats | null = null
  let lastT = performance.now()
  let lastHidden = document.visibilityState === 'hidden'

  const sample = () => {
    const ctx = getCtx()
    const s = (ctx as (AudioContext & { playbackStats?: Stats }) | null)?.playbackStats
    const now = performance.now()
    if (ctx && s && ctx.state === 'running') {
      if (last) {
        const bucket = lastHidden ? acc.bg : acc.fg
        bucket.n += s.underrunEvents - last.underrunEvents
        bucket.ms += (s.underrunDuration - last.underrunDuration) * 1000
        bucket.sec += (now - lastT) / 1000
      }
      last = { underrunEvents: s.underrunEvents, underrunDuration: s.underrunDuration }
    } else {
      last = null
    }
    lastT = now
    lastHidden = document.visibilityState === 'hidden'
    const lat = ctx ? `${(ctx.baseLatency * 1000).toFixed(1)}ms` : '-'
    const row = (k: 'fg' | 'bg') => `${k === 'fg' ? '前台' : '后台'} ${acc[k].sec.toFixed(0)}s 掉块${acc[k].n}次/${acc[k].ms.toFixed(0)}ms`
    el.textContent = s || !ctx ? `buf ${lat} ${ctx?.state ?? ''}\n${row('fg')}\n${row('bg')}` : `buf ${lat} playbackStats n/a`
  }
  // 切换前后台时先结一次账，免得两边混在一起
  document.addEventListener('visibilitychange', sample)
  setInterval(sample, 1000)
}
