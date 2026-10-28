import { useCallback, useEffect, useRef, useState } from 'react'
import { MODE_DETAILS } from './ModeSelector'
import { DENSITY_DETAILS } from './density'
import { getPhase, type Phase } from '../audio/rules'
import type { Mode } from '../types'
import { engine as audioEngine, type Density } from '../audio/engine'
import { ParticleCanvas } from './ParticleCanvas'
import sessionImage from '../assets/zen-night-valley.jpg'
import sessionImageAvif from '../assets/zen-night-valley.avif'

const getRecentEvents = () => audioEngine.getRecentEvents()

/** 播放中无操作多久后文字渐隐 */
const IDLE_MS = 9000
/** 离开计时页的淡出时长（与引擎淡出同节奏） */
const LEAVE_MS = 1400
/** 末尾这几秒里，画面跟着最后一声钟一起慢慢暗下去（引擎此时已在收尾） */
const ENDING_S = 20
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const PHASES: Phase[] = ['entering', 'settling', 'deep', 'returning']

/** 画面光的亮度：疏暗一点、满亮一点，跟声音一致 */
const DENSITY_LIGHT: Record<Density, number> = { sparse: 0.32, mid: 0.44, full: 0.56 }

type SessionViewProps = {
  mode: Mode
  duration: number
  density: Density
  onReturn: () => void
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionView({ mode, duration, density, onReturn }: SessionViewProps) {
  const totalSeconds = duration * 60
  const [remaining, setRemaining] = useState(totalSeconds)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isIdle, setIsIdle] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orbRef = useRef<HTMLDivElement>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 倒计时
  useEffect(() => {
    if (!isPlaying) return
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer()
          setIsPlaying(false)
          setIsFinished(true)
          audioEngine.stop()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return clearTimer
  }, [isPlaying, clearTimer])

  // 新会话：新种子、从头开始；疏密在这里定，播放中不改。卸载清理
  useEffect(() => {
    audioEngine.prepareSession?.(mode, totalSeconds, density)
    return () => { audioEngine.stopImmediate() }
  }, [mode, totalSeconds, density])

  // 播放中一段时间无操作：文字渐隐，只留圆环；任何触碰再浮现
  useEffect(() => {
    if (!isPlaying) return
    let timer = setTimeout(() => setIsIdle(true), IDLE_MS)
    const wake = () => {
      setIsIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIsIdle(true), IDLE_MS)
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [isPlaying])

  // 页面回到前台时恢复 AudioContext（浏览器会在后台挂起它）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        audioEngine.resumeContext()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isPlaying])

  const handlePlayPause = async () => {
    if (isFinished) return
    if (isPlaying) {
      setIsPlaying(false)
      setIsIdle(false)
      audioEngine.stop()
      return
    }
    // 按下即退景：不等样本加载，失败时恢复原状态
    const wasStarted = hasStarted
    try {
      setIsPlaying(true)
      setHasStarted(true)
      setErrorMessage(null)
      await audioEngine.play()
    } catch (err) {
      setIsPlaying(false)
      setHasStarted(wasStarted)
      setErrorMessage(err instanceof Error ? err.message : '无法初始化音频，请检查浏览器设置')
    }
  }

  const handleReturn = () => {
    if (isClosing) return
    setIsClosing(true)
    if (audioEngine.playing) audioEngine.stop()
    window.setTimeout(() => {
      audioEngine.stopImmediate()
      onReturn()
    }, reducedMotion() ? 0 : LEAVE_MS)
  }

  const handleRestart = () => {
    audioEngine.stopImmediate()
    audioEngine.prepareSession?.(mode, totalSeconds, density)
    setRemaining(totalSeconds)
    setIsFinished(false)
    setIsPlaying(false)
    setHasStarted(false)
    setErrorMessage(null)
  }

  const progress = 1 - remaining / totalSeconds
  const currentPhase: Phase = getPhase(progress)
  const phaseLabel: Record<Phase, string> = {
    entering: '入定',
    settling: '安住',
    deep: '深境',
    returning: '回转',
  }

  return (
    <main
      className={[
        'session-view',
        isPlaying && 'is-playing',
        hasStarted && 'has-started',
        isFinished && 'is-finished',
        isPlaying && isIdle && 'is-idle',
        hasStarted && !isFinished && remaining <= ENDING_S && 'is-ending',
        isClosing && 'is-closing',
      ].filter(Boolean).join(' ')}
      aria-label="声景会话"
      style={{
        '--session-bg': `url(${sessionImage})`,
        '--session-bg-set': `image-set(url(${sessionImageAvif}) type("image/avif"), url(${sessionImage}) type("image/jpeg"))`,
      } as React.CSSProperties}
    >
      <div className="grain" aria-hidden="true" />
      <ParticleCanvas
        isPlaying={isPlaying}
        brightness={DENSITY_LIGHT[density]}
        getEvents={getRecentEvents}
        anchorRef={orbRef}
      />

      <header className="session-header">
        <button type="button" className="session-return" onClick={handleReturn}>
          <span aria-hidden="true">←</span> 离开声景
        </button>
        <span className="session-wordmark">竹间息</span>
        <span
          className="session-phase"
          role="status"
          title="声景会经过 入定 · 安住 · 深境 · 回转 四段"
          aria-label={`当前阶段：${isFinished ? '圆满' : phaseLabel[currentPhase]}，共四段`}
        >
          <span className="session-phase-steps" aria-hidden="true">
            {PHASES.map((p) => (
              <i key={p} className={p === currentPhase || (isFinished && p === 'returning') ? 'is-now' : ''} />
            ))}
          </span>
          {isFinished ? '圆满' : phaseLabel[currentPhase]}
        </span>
      </header>

      <section className="session-stage" aria-labelledby="session-title">
        <h1 id="session-title" className="session-title">
          {MODE_DETAILS[mode].label}
          <span className="session-density" aria-label={`声音：${DENSITY_DETAILS[density].short}`}>
            {DENSITY_DETAILS[density].short}
          </span>
        </h1>

        <div className="session-orb" ref={orbRef}>
          <svg viewBox="0 0 184 184" className="orb-ring orb-breath" aria-hidden="true">
            <circle className="orb-track" cx="92" cy="92" r="88" fill="none" />
            <circle
              className="orb-progress"
              cx="92"
              cy="92"
              r="88"
              fill="none"
              strokeDasharray={`${progress * 552.92} 552.92`}
              transform="rotate(-90 92 92)"
            />
            {progress > 0 && (
              <circle
                className="orb-head"
                cx={92 + 88 * Math.cos(progress * 2 * Math.PI - Math.PI / 2)}
                cy={92 + 88 * Math.sin(progress * 2 * Math.PI - Math.PI / 2)}
                r="2.4"
              />
            )}
          </svg>
          <div className="orb-inner">
            <div className="countdown" role="timer" aria-label={`剩余时间 ${formatTime(remaining)}`}>
              {formatTime(remaining)}
            </div>
          </div>
        </div>

        {isFinished ? (
          <p className="session-copy">一段声景结束了。片刻仍在。</p>
        ) : isPlaying ? (
          <p className="session-copy">不必追随声音，让它自行来去。</p>
        ) : (
          <p className="session-copy">按下播放，让声音慢慢醒来。</p>
        )}

        {errorMessage && (
          <p className="session-copy error-message" role="alert">
            {errorMessage}
          </p>
        )}

        {isFinished ? (
          <div className="session-actions">
            <button type="button" className="primary-action" onClick={handleRestart}>再来一次</button>
            <button type="button" className="ghost-action" onClick={handleReturn}>回到首页</button>
          </div>
        ) : (
          <div className="session-playback">
            <button
              type="button"
              className="session-play-button"
              onClick={handlePlayPause}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? '暂停声景' : '播放声景'}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z" /></svg>
              )}
            </button>
            <span className="session-play-label">{isPlaying ? '暂停' : '开始'}</span>
          </div>
        )}
      </section>

      <div className="session-bottom">
        <p className="zen-quote" aria-hidden={hasStarted && !isFinished}>竹影扫阶尘不动，月穿潭底水无痕</p>
      </div>
    </main>
  )
}
