import { useCallback, useEffect, useRef, useState } from 'react'
import { MODE_DETAILS } from './ModeSelector'
import type { SoundParams } from '../audio/soundParams'
import { computeParams, getPhase, type Phase } from '../audio/rules'
import type { Mode } from '../types'
import { engine as audioEngine } from '../audio/engine'
import { ParticleCanvas } from './ParticleCanvas'
import sessionImage from '../assets/zen-night-valley.jpg'

const getRecentEvents = () => audioEngine.getRecentEvents()

type SessionViewProps = {
  mode: Mode
  duration: number
  soundParams: SoundParams
  onSoundParamsChange: (params: SoundParams) => void
  onReturn: () => void
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionView({
  mode,
  duration,
  soundParams: initialSoundParams,
  onSoundParamsChange,
  onReturn,
}: SessionViewProps) {
  const totalSeconds = duration * 60
  const [remaining, setRemaining] = useState(totalSeconds)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionParams, setSessionParams] = useState<SoundParams>(initialSoundParams)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  // 用户手动调过的参数，规则引擎不再覆盖
  const userTouched = useRef<Set<keyof SoundParams>>(new Set())
  // 用 ref 存最新 sessionParams，避免 useEffect 闭包问题
  const sessionParamsRef = useRef(sessionParams)
  // 在 effect 里更新 ref，避免 render 期间写 ref
  useEffect(() => {
    sessionParamsRef.current = sessionParams
  }, [sessionParams])

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 倒计时
  useEffect(() => {
    if (isPlaying && remaining > 0) {
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
    }
    return clearTimer
  }, [isPlaying, clearTimer])

  // 新会话（v2：新种子、从头开始）；卸载清理
  useEffect(() => {
    audioEngine.prepareSession?.(mode, totalSeconds)
    return () => { audioEngine.stopImmediate() }
  }, [mode, totalSeconds])

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

  // ref 持有最新的 remaining / totalSeconds，供规则引擎 tick 读取
  const remainingRef = useRef(remaining)
  useEffect(() => { remainingRef.current = remaining }, [remaining])
  const totalSecondsRef = useRef(totalSeconds)
  useEffect(() => { totalSecondsRef.current = totalSeconds }, [totalSeconds])

  // M4：规则引擎——每 4 秒根据进度重新计算参数
  useEffect(() => {
    if (!isPlaying || isFinished) return
    // v2：阶段变化（入定→深境→回转的疏密、轻重）已写进乐谱，滑杆保持用户的值
    if (audioEngine.ownsDynamics) return

    const tick = () => {
      const progress = 1 - remainingRef.current / totalSecondsRef.current
      const hour = new Date().getHours()
      const output = computeParams(mode, progress, {}, hour)
      // 只更新用户没手动调过的参数
      const merged: SoundParams = { ...sessionParamsRef.current }
      for (const key of Object.keys(output.soundParams) as (keyof SoundParams)[]) {
        if (!userTouched.current.has(key)) {
          merged[key] = output.soundParams[key]
        }
      }
      setSessionParams(merged)
      audioEngine.setSchedulerParams(output.schedulerParams)
    }

    tick()
    const timer = setInterval(tick, 4000)
    return () => clearInterval(timer)
  }, [isPlaying, isFinished, mode])

  // 参数实时同步到 engine
  useEffect(() => {
    audioEngine.setMode(mode)
    audioEngine.setMasterVolume(sessionParams.masterVolume)
    audioEngine.setNatureLevel(sessionParams.natureLevel)
    audioEngine.setInstrumentLevel(sessionParams.instrumentLevel)
    audioEngine.setSpatialLevel(sessionParams.spatialLevel)
    audioEngine.setBrightness(sessionParams.brightness)
  }, [mode, sessionParams])

  const handlePlayPause = async () => {
    if (isFinished) return
    if (isPlaying) {
      setIsPlaying(false)
      audioEngine.stop()
    } else {
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
        const msg = err instanceof Error ? err.message : '无法初始化音频，请检查浏览器设置'
        setErrorMessage(msg)
      }
    }
  }

  const handleReturn = () => {
    audioEngine.stopImmediate()
    onReturn()
  }

  const handleRestart = () => {
    audioEngine.stopImmediate()
    audioEngine.prepareSession?.(mode, totalSeconds)
    userTouched.current.clear()
    setRemaining(totalSeconds)
    setIsFinished(false)
    setIsPlaying(false)
    setHasStarted(false)
    setErrorMessage(null)
  }

  const handleParamChange = (key: keyof SoundParams, value: number) => {
    userTouched.current.add(key)
    const nextParams = { ...sessionParams, [key]: value }
    setSessionParams(nextParams)
    onSoundParamsChange(nextParams)
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
      className={`session-view ${isPlaying ? 'is-playing' : ''} ${hasStarted ? 'has-started' : ''} ${isFinished ? 'is-finished' : ''}`}
      aria-label="声景会话"
      style={{ '--session-bg': `url(${sessionImage})` } as React.CSSProperties}
    >
      <ParticleCanvas
        isPlaying={isPlaying}
        brightness={sessionParams.brightness}
        getEvents={getRecentEvents}
        anchorRef={orbRef}
      />

      <header className="session-header">
        <button type="button" className="session-return" onClick={handleReturn}>
          <span aria-hidden="true">←</span> 离开声景
        </button>
        <span className="session-wordmark">竹间息</span>
        <span className="session-phase">{isFinished ? '圆满' : phaseLabel[currentPhase]}</span>
      </header>

      <section className="session-stage" aria-labelledby="session-title">
        <h1 id="session-title" className="session-title">{MODE_DETAILS[mode].label}</h1>

        <div className="session-orb" ref={orbRef}>
          <svg viewBox="0 0 184 184" className="orb-ring" aria-hidden="true">
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
            <circle className="orb-breath" cx="92" cy="92" r="62" fill="none" />
          </svg>
          <div className="orb-inner">
            <span className="countdown-label">{isFinished ? '声景已止' : isPlaying ? '此刻' : '准备'}</span>
            <div className="countdown" role="timer" aria-label={`剩余时间 ${formatTime(remaining)}`}>
              {formatTime(remaining)}
            </div>
            <span className="countdown-caption">剩余时间</span>
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
        {isPlaying && !isFinished && (
          <details className="session-tuning">
            <summary>细调声音</summary>
            <div className="session-sliders">
              {([
                ['masterVolume', '音量'],
                ['natureLevel', '自然'],
                ['instrumentLevel', '乐器'],
                ['spatialLevel', '空间'],
                ['brightness', '明亮'],
              ] as const).map(([key, label]) => (
                <div key={key} className="session-slider-row">
                  <label htmlFor={`ss-${key}`} className="session-slider-label">{label}</label>
                  <input
                    id={`ss-${key}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={sessionParams[key]}
                    onChange={(e) => handleParamChange(key, Number(e.target.value))}
                    className="zen-slider zen-slider--sm"
                  />
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="zen-quote" aria-hidden={hasStarted && !isFinished}>竹影扫阶尘不动，月穿潭底水无痕</p>
      </div>
    </main>
  )
}
