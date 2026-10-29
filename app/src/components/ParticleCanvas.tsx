/**
 * ParticleCanvas — 会话里的光
 *
 * - 环境光斑：两颗，分居画面左右，慢慢明灭、几乎不动；避开中间的圆环与时间
 * - 钟声：从圆环向外散开一圈极淡的金线，像声音在山谷里散开
 * - 古琴：在圆环上按声像方向亮起一小段弧，像被拨了一下
 *
 * 全部按真实时间推进（与屏幕刷新率无关），按设备像素比绘制；没有东西可画时停止渲染循环。
 */

import { useEffect, useRef, type RefObject } from 'react'
import type { RecentEvent } from '../audio/AudioEngine'

interface Orb {
  /** 归一化坐标（0–1），随窗口尺寸换算 */
  nx: number
  ny: number
  radius: number
  phase: number
  speed: number
  maxOpacity: number
  driftPhase: number
}

interface Wave {
  kind: 'bell' | 'qin'
  born: number
  /** 古琴弧所在角度（弧度，0 = 右，-π/2 = 上） */
  angle: number
}

type ParticleCanvasProps = {
  isPlaying: boolean
  brightness: number
  /** 取最近事件（最新在前）；由画布自己轮询，不靠 React 重渲染 */
  getEvents: () => RecentEvent[]
  /** 圆环元素：涟漪从这里生出 */
  anchorRef: RefObject<HTMLElement | null>
}

const BELL_LIFE = 7.5 // 秒
const QIN_LIFE = 2.6
const ORB_FADE = 2.5 // 播放/暂停时光斑渐入渐出的时间
const POLL_MS = 200
const GOLD = '200, 185, 145'
const MIST = '166, 190, 170'

/** 光斑半径按视口短边算，手机和桌面看到的是同一种"轻" */
const ORB_RADIUS_VMIN = 0.13
const ORB_RADIUS_SPAN_VMIN = 0.05
/** 亮度上限：低到只当背景的一层呼吸，不成为画面里的"一块" */
const ORB_OPACITY = 0.04
const ORB_OPACITY_SPAN = 0.015

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

function makeOrbs(): Orb[] {
  // 一左一右，纵向错开；远离中间三分之一
  const vmin = Math.min(window.innerWidth, window.innerHeight)
  const sides = [
    [0.12 + Math.random() * 0.14, 0.28 + Math.random() * 0.2],
    [0.74 + Math.random() * 0.14, 0.52 + Math.random() * 0.2],
  ]
  return sides.map(([nx, ny]) => ({
    nx,
    ny,
    radius: vmin * (ORB_RADIUS_VMIN + Math.random() * ORB_RADIUS_SPAN_VMIN),
    phase: Math.random() * Math.PI * 2,
    speed: 0.14 + Math.random() * 0.08, // 约 30–45 秒一次明灭
    maxOpacity: ORB_OPACITY + Math.random() * ORB_OPACITY_SPAN,
    driftPhase: Math.random() * Math.PI * 2,
  }))
}

export function ParticleCanvas({ isPlaying, brightness, getEvents, anchorRef }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPlayingRef = useRef(isPlaying)
  const brightnessRef = useRef(brightness)
  const getEventsRef = useRef(getEvents)
  const kickRef = useRef<() => void>(() => undefined)

  useEffect(() => { brightnessRef.current = brightness }, [brightness])
  useEffect(() => { getEventsRef.current = getEvents }, [getEvents])
  useEffect(() => {
    isPlayingRef.current = isPlaying
    kickRef.current()
  }, [isPlaying])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    let reduced = motionQuery?.matches ?? false
    const onMotion = (e: MediaQueryListEvent) => { reduced = e.matches }
    motionQuery?.addEventListener('change', onMotion)

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const orbs = makeOrbs()
    const waves: Wave[] = []
    // 只认这个时间点之后的事件：挂载前的旧事件不补画
    let lastSeen = performance.now()
    let lastPoll = 0
    let orbLevel = 0 // 0–1，光斑整体亮度（跟随播放状态缓慢变化）
    let raf = 0
    let running = false
    let prev = 0
    let clock = 0

    const poll = (now: number) => {
      if (now - lastPoll < POLL_MS) return
      lastPoll = now
      const events = getEventsRef.current()
      // 最新在前：从后往前推进，保持时间顺序
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i]
        if (e.time <= lastSeen) continue
        lastSeen = e.time
        waves.push({
          kind: e.type === 'temple_bell' ? 'bell' : 'qin',
          born: clock,
          angle: -Math.PI / 2 + Math.max(-1, Math.min(1, e.pan)) * (Math.PI / 2),
        })
      }
      if (waves.length > 12) waves.splice(0, waves.length - 12)
    }

    const anchor = () => {
      const el = anchorRef.current
      if (!el) return { cx: w / 2, cy: h * 0.45, r: Math.min(w, h) * 0.18 }
      const b = el.getBoundingClientRect()
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: (b.width / 2) * (88 / 92) }
    }

    const frame = (now: number) => {
      const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0
      prev = now
      clock += dt

      if (isPlayingRef.current) poll(now)

      const target = isPlayingRef.current ? 1 : 0
      const step = dt / ORB_FADE
      orbLevel = target > orbLevel ? Math.min(target, orbLevel + step) : Math.max(target, orbLevel - step)

      ctx.clearRect(0, 0, w, h)
      const lum = 0.6 + 0.8 * brightnessRef.current

      // ── 环境光斑
      if (orbLevel > 0.001) {
        for (const o of orbs) {
          const breath = Math.sin(clock * o.speed + o.phase) * 0.5 + 0.5
          const alpha = o.maxOpacity * (0.35 + 0.65 * breath) * orbLevel * lum
          const drift = reduced ? 0 : 1
          const x = o.nx * w + Math.sin(clock * 0.03 + o.driftPhase) * 18 * drift
          const y = o.ny * h + Math.cos(clock * 0.025 + o.driftPhase * 1.3) * 12 * drift
          const g = ctx.createRadialGradient(x, y, 0, x, y, o.radius)
          g.addColorStop(0, `rgba(${MIST}, ${alpha})`)
          g.addColorStop(0.55, `rgba(${MIST}, ${alpha * 0.28})`)
          g.addColorStop(1, `rgba(${MIST}, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(x, y, o.radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ── 钟与琴（暂停后已出现的照样散完）
      if (waves.length) {
        const { cx, cy, r } = anchor()
        for (let i = waves.length - 1; i >= 0; i--) {
          const wv = waves[i]
          const age = clock - wv.born
          const life = wv.kind === 'bell' ? BELL_LIFE : QIN_LIFE
          if (age >= life) {
            waves.splice(i, 1)
            continue
          }
          const t = age / life
          if (wv.kind === 'bell') {
            // 一圈细线从圆环慢慢外扩到约 2.4 倍，先亮后淡
            const rad = reduced ? r * 1.15 : r * (1 + 1.4 * easeOut(t))
            const alpha = 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.08)) * (1 - t) * lum
            if (alpha <= 0.003) continue
            ctx.strokeStyle = `rgba(${GOLD}, ${alpha})`
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.arc(cx, cy, rad, 0, Math.PI * 2)
            ctx.stroke()
          } else {
            // 圆环上一小段弧：快亮慢灭，略微外移
            const rise = Math.min(1, t / 0.12)
            const alpha = 0.7 * rise * Math.pow(1 - t, 1.6) * lum
            if (alpha <= 0.003) continue
            const span = 0.32 + 0.12 * t
            const rad = r + (reduced ? 0 : 6 * easeOut(t))
            ctx.strokeStyle = `rgba(${GOLD}, ${alpha})`
            ctx.lineWidth = 1.6
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.arc(cx, cy, rad, wv.angle - span / 2, wv.angle + span / 2)
            ctx.stroke()
          }
        }
      }

      // 没东西可画就停：暂停后光斑淡尽、涟漪散完即止
      const idle = !isPlayingRef.current && orbLevel <= 0 && waves.length === 0
      if (idle || document.hidden) {
        running = false
        prev = 0
        return
      }
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running || document.hidden) return
      running = true
      prev = 0
      raf = requestAnimationFrame(frame)
    }
    kickRef.current = start
    if (isPlayingRef.current) start()

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        running = false
      } else {
        // 后台期间的事件不补画，免得回来时一起炸开
        lastSeen = performance.now()
        start()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      running = false
      kickRef.current = () => undefined
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery?.removeEventListener('change', onMotion)
    }
  }, [anchorRef])

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />
}
