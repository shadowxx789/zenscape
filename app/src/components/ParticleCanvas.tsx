/**
 * ParticleCanvas — ZenScape M6 禅意粒子艺术
 *
 * Canvas 粒子系统：
 * - 播放时粒子缓慢流动，停止时淡出
 * - 温暖、克制、禅意风格
 * - 粒子响应亮度参数
 */

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  targetOpacity: number
  hue: number // 色相偏移
}

type ParticleCanvasProps = {
  isPlaying: boolean
  brightness: number // 0-1, 影响粒子亮度和数量
}

const PARTICLE_COUNT = 40
const BASE_SPEED = 0.15
const BASE_RADIUS = 1.5
const FADE_SPEED = 0.008

export function ParticleCanvas({ isPlaying, brightness }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animRef = useRef<number>(0)
  const globalOpacityRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 尺寸
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // 初始化粒子
    if (particlesRef.current.length === 0) {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => createParticle(canvas.width, canvas.height))
    }

    // 动画循环
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 全局透明度：播放时渐入，停止时渐出
      const targetGlobalOpacity = isPlaying ? 1 : 0
      globalOpacityRef.current += (targetGlobalOpacity - globalOpacityRef.current) * FADE_SPEED

      if (globalOpacityRef.current < 0.001) {
        animRef.current = requestAnimationFrame(animate)
        return
      }

      // 粒子数量随亮度调整
      const targetCount = Math.floor(PARTICLE_COUNT * (0.5 + brightness * 0.5))
      while (particlesRef.current.length < targetCount) {
        particlesRef.current.push(createParticle(canvas.width, canvas.height))
      }
      while (particlesRef.current.length > targetCount) {
        particlesRef.current.pop()
      }

      // 绘制
      for (const p of particlesRef.current) {
        // 移动
        p.x += p.vx
        p.y += p.vy

        // 边界循环
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10

        // 透明度随亮度调整
        p.targetOpacity = 0.15 + brightness * 0.25
        p.opacity += (p.targetOpacity - p.opacity) * 0.02

        // 绘制粒子
        const alpha = p.opacity * globalOpacityRef.current
        if (alpha < 0.001) continue

        // 主粒子
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 30%, 70%, ${alpha})`
        ctx.fill()

        // 柔光光晕
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 25%, 65%, ${alpha * 0.15})`
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [isPlaying, brightness])

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      aria-hidden="true"
    />
  )
}

function createParticle(w: number, h: number): Particle {
  // 色相：暖色调范围 (20-50, 橙黄暖色系)
  const hue = 20 + Math.random() * 30
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * BASE_SPEED,
    vy: (Math.random() - 0.5) * BASE_SPEED * 0.3 - BASE_SPEED * 0.1, // 轻微向上飘
    radius: BASE_RADIUS + Math.random() * 1.5,
    opacity: 0,
    targetOpacity: 0.2,
    hue,
  }
}
