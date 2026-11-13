/**
 * LivingBackdrop — 让背景图自己慢慢动起来（three.js 全屏着色器）
 *
 * 渐进增强：静态图始终在下面垫着；WebGL 不可用、用户要求减少动态、或着色器出错时，
 * 画布不出现，页面与原来完全一样。开场 uIntro 从 0 升到 1，第一帧与静态图一致，换上去不闪。
 *
 * 省电：three 按需加载；内部分辨率按视口缩小（图本身已模糊处理）；限 30 帧；页面隐藏即停。
 */

import { useEffect, useRef } from 'react'
import { BAMBOO_FRAGMENT, NIGHT_FRAGMENT, VERTEX } from './shaders'

export type BackdropScene = 'bamboo' | 'night'

type LivingBackdropProps = {
  scene: BackdropScene
  /** 取图：返回当前应显示的图片地址（首页跟随 <picture> 的选择） */
  getSrc: () => string | null
  /** 取构图焦点（等价 object-position，0–1）；不给则居中 */
  getFocus?: () => [number, number]
  className?: string
  /** 画布可用后回调，用于隐藏下面的静态层 */
  onReady?: (ready: boolean) => void
}

const FPS = 30
const INTRO_S = 4
/** 内部渲染分辨率上限（长边像素）：背景本来就是柔焦的，不需要满分辨率 */
const MAX_LONG_EDGE = 1280

/** 默认强度：Eric 看过 1/2/3 对比后选定（首页 2，计时页 1） */
const DEFAULT_STRENGTH: Record<BackdropScene, number> = { bamboo: 2, night: 1 }

/** 动效强度：?motion=1 / 2 / 3 可临时覆盖供比较；0 关闭 */
function motionStrength(scene: BackdropScene): number {
  const fallback = DEFAULT_STRENGTH[scene]
  const raw = new URLSearchParams(window.location.search).get('motion')
  const v = raw === null ? fallback : Number(raw)
  return Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : fallback
}

export function LivingBackdrop({ scene, getSrc, getFocus, className, onReady }: LivingBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const getSrcRef = useRef(getSrc)
  const getFocusRef = useRef(getFocus)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    getSrcRef.current = getSrc
    getFocusRef.current = getFocus
    onReadyRef.current = onReady
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const k = motionStrength(scene)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (k === 0 || reduced) return

    let disposed = false
    let cleanup = () => {}

    void (async () => {
      const THREE = await import('three')
      if (disposed) return
      const src = getSrcRef.current()
      if (!src) return

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' })
      } catch {
        return // 没有 WebGL：留着静态图
      }
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace
      let shaderFailed = false
      renderer.debug.onShaderError = (gl, program, vs, fs) => {
        shaderFailed = true
        console.warn('[LivingBackdrop] shader error', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs))
      }

      const texture = await new THREE.TextureLoader().loadAsync(src).catch(() => null)
      if (disposed || !texture) {
        renderer.dispose()
        texture?.dispose()
        return
      }
      // 原样取色、原样输出：画面与 <img> 一致
      texture.colorSpace = THREE.NoColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.generateMipmaps = false
      const img = texture.image as { width: number; height: number }

      const uniforms = {
        uTex: { value: texture },
        uView: { value: new THREE.Vector2(1, 1) },
        uImgAspect: { value: img.width / img.height },
        uFocus: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0 },
        uK: { value: k },
        uIntro: { value: 0 },
        uPortrait: { value: img.height > img.width ? 1 : 0 },
      }
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: scene === 'bamboo' ? BAMBOO_FRAGMENT : NIGHT_FRAGMENT,
        uniforms,
        depthTest: false,
        depthWrite: false,
      })
      const geometry = new THREE.PlaneGeometry(2, 2)
      const quad = new THREE.Mesh(geometry, material)
      const sceneObj = new THREE.Scene()
      sceneObj.add(quad)
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

      const resize = () => {
        const w = window.innerWidth
        const h = window.innerHeight
        const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h), window.devicePixelRatio || 1)
        renderer.setPixelRatio(1)
        renderer.setSize(Math.round(w * scale), Math.round(h * scale), false)
        uniforms.uView.value.set(w, h)
        const f = getFocusRef.current?.()
        if (f) uniforms.uFocus.value.set(f[0], f[1])
      }
      resize()
      window.addEventListener('resize', resize)

      // 首帧先画出来并检查编译是否成功，再显示画布
      renderer.render(sceneObj, camera)
      if (shaderFailed || renderer.getContext().isContextLost()) {
        window.removeEventListener('resize', resize)
        geometry.dispose()
        material.dispose()
        texture.dispose()
        renderer.dispose()
        return
      }

      let raf = 0
      let last = 0
      let clock = Math.random() * 600 // 每次进入从不同的风开始
      let intro = 0
      let prev = 0
      let shown = false

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        if (now - last < 1000 / FPS - 2) return
        last = now
        const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0
        prev = now
        clock += dt
        intro = Math.min(1, intro + dt / INTRO_S)
        uniforms.uTime.value = clock
        uniforms.uIntro.value = intro * intro * (3 - 2 * intro)
        renderer.render(sceneObj, camera)
        if (!shown) {
          shown = true
          canvas.classList.add('is-live')
          onReadyRef.current?.(true)
        }
      }
      const start = () => {
        if (raf || document.hidden) return
        prev = 0
        raf = requestAnimationFrame(frame)
      }
      const stop = () => {
        cancelAnimationFrame(raf)
        raf = 0
      }
      const onVisibility = () => (document.hidden ? stop() : start())
      document.addEventListener('visibilitychange', onVisibility)

      const onLost = (e: Event) => {
        e.preventDefault()
        stop()
        canvas.classList.remove('is-live')
        onReadyRef.current?.(false)
      }
      canvas.addEventListener('webglcontextlost', onLost)
      start()

      cleanup = () => {
        stop()
        window.removeEventListener('resize', resize)
        document.removeEventListener('visibilitychange', onVisibility)
        canvas.removeEventListener('webglcontextlost', onLost)
        geometry.dispose()
        material.dispose()
        texture.dispose()
        renderer.dispose()
        onReadyRef.current?.(false)
      }
      if (disposed) cleanup()
    })()

    return () => {
      disposed = true
      cleanup()
    }
  }, [scene])

  return <canvas ref={canvasRef} className={['living-backdrop', className].filter(Boolean).join(' ')} aria-hidden="true" />
}
