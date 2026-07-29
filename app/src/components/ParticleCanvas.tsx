/**
 * ParticleCanvas — BreezeScape M6 禅意粒子艺术
 *
 * 涟漪粒子系统：
 * - 平时只有 3-5 个 orb 在画面里缓慢呼吸
 * - 事件（钟声/古琴）触发时，从事件 pan 位置扩散出一圈涟漪
 * - 涟漪扩散后自然衰减消失
 */

import { useEffect, useRef } from 'react'

// ── 环境微光 ──
interface Orb {
  x: number
  y: number
  radius: number
  phase: number // 呼吸相位
  speed: number // 呼吸速度
  maxOpacity: number
}

// ── 事件涟漪 ──
interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  opacity: number
  speed: number
  width: number
}

type ParticleCanvasProps = {
  isPlaying: boolean
  brightness: number
  recentPans?: number[] // 由 AudioEngine 传入的事件 pan 位置
}

const ORB_COUNT = 4
const ORB_BASE_RADIUS = 60

export function ParticleCanvas({ isPlaying, brightness, recentPans }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbsRef = useRef<Orb[]>([])
  const ripplesRef = useRef<Ripple[]>([])
  const animRef = useRef<number>(0)
  const isPlayingRef = useRef(isPlaying)
  const brightnessRef = useRef(brightness)
  const lastEventCountRef = useRef(0)

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { brightnessRef.current = brightness }, [brightness])

  // 事件触发涟漪
  useEffect(() => {
    if (!recentPans || recentPans.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return

    const currentCount = recentPans.length
    if (currentCount <= lastEventCountRef.current) return

    // 新事件 → 在对应 pan 位置产生涟漪
    for (let i = lastEventCountRef.current; i < currentCount; i++) {
      const pan = recentPans[i] ?? 0
      // pan [-1,1] → x position
      const x = canvas.width * (0.5 + pan * 0.4)
      const y = canvas.height * 0.55 // 画面中下部，视觉中心偏下
      ripplesRef.current.push({
        x, y,
        radius: 10,
        maxRadius: 200 + Math.random() * 120,
        opacity: 0.6 + Math.random() * 0.2,
        speed: 1.2 + Math.random() * 0.8,
        width: 1.5 + Math.random() * 1.5,
      })
    }
    // 限制涟漪数量
    if (ripplesRef.current.length > 20) {
      ripplesRef.current = ripplesRef.current.slice(-20)
    }
    lastEventCountRef.current = currentCount
  }, [recentPans])

  // 初始化环境 orb
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || orbsRef.current.length > 0) return
    orbsRef.current = Array.from({ length: ORB_COUNT }, () => ({
      x: canvas.width * (0.15 + Math.random() * 0.7),
      y: canvas.height * (0.2 + Math.random() * 0.6),
      radius: ORB_BASE_RADIUS + Math.random() * 60,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
      maxOpacity: 0.06 + Math.random() * 0.06,
    }))
  }, [])

  // 主循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mediaQuery = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    let prefersReducedMotion = mediaQuery ? mediaQuery.matches : false
    const handleMotionChange = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches }
    if (mediaQuery) mediaQuery.addEventListener('change', handleMotionChange)

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let time = 0

    const animate = () => {
      time += 0.016
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const globalFade = isPlayingRef.current ? 1 : 0
      const brightnessFactor = brightnessRef.current

      // ── 环境 orb（呼吸微光）──
      for (const orb of orbsRef.current) {
        const breath = Math.sin(time * orb.speed + orb.phase) * 0.5 + 0.5
        const alpha = orb.maxOpacity * breath * globalFade * brightnessFactor
        if (alpha < 0.002) continue

        const drift = prefersReducedMotion ? 0 : 0.1
        orb.x += Math.sin(time * 0.15 + orb.phase) * drift
        orb.y += Math.cos(time * 0.12 + orb.phase * 1.3) * drift * 0.5

        // ambient glow
        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius)
        gradient.addColorStop(0, `rgba(166, 190, 170, ${alpha})`)
        gradient.addColorStop(0.5, `rgba(166, 190, 170, ${alpha * 0.3})`)
        gradient.addColorStop(1, 'rgba(166, 190, 170, 0)')
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // ── 事件涟漪 ──
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i]
        if (!prefersReducedMotion) {
          r.radius += r.speed
        }
        r.opacity *= 0.995

        if (r.radius > r.maxRadius || r.opacity < 0.01) {
          ripplesRef.current.splice(i, 1)
          continue
        }

        const alpha = r.opacity * globalFade
        if (alpha < 0.005) continue

        // 涟漪圆环
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(200, 220, 205, ${alpha * 0.6})`
        ctx.lineWidth = r.width
        ctx.stroke()

        // 内圈微光
        const fadeGrad = ctx.createRadialGradient(r.x, r.y, r.radius * 0.8, r.x, r.y, r.radius)
        fadeGrad.addColorStop(0, 'rgba(200,220,205,0)')
        fadeGrad.addColorStop(1, `rgba(200,220,205,${alpha * 0.1})`)
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
        ctx.fillStyle = fadeGrad
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current)
      } else {
        cancelAnimationFrame(animRef.current)
        animRef.current = requestAnimationFrame(animate)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (mediaQuery) mediaQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      aria-hidden="true"
    />
  )
}
