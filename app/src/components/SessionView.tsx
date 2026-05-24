import { useCallback, useEffect, useRef, useState } from 'react'
import { MODE_DETAILS } from './ModeSelector'
import type { SoundParams } from '../audio/soundParams'
import { computeParams, getPhase, type Phase } from '../audio/rules'
import type { Mode } from '../types'
import { audioEngine } from '../audio/AudioEngine'
import { ParticleCanvas } from './ParticleCanvas'
import sessionImage from '../assets/zen-night-valley.jpg'

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
  const [isFinished, setIsFinished] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionParams, setSessionParams] = useState<SoundParams>(initialSoundParams)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
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

  // 卸载清理
  useEffect(() => {
    return () => { audioEngine.stopImmediate() }
  }, [])

  // ref 持有最新的 remaining / totalSeconds，供规则引擎 tick 读取
  const remainingRef = useRef(remaining)
  useEffect(() => { remainingRef.current = remaining }, [remaining])
  const totalSecondsRef = useRef(totalSeconds)
  useEffect(() => { totalSecondsRef.current = totalSeconds }, [totalSeconds])

  // M4：规则引擎——每 4 秒根据进度重新计算参数
  useEffect(() => {
    if (!isPlaying || isFinished) return

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
      try {
        setIsPlaying(true)
        setErrorMessage(null)
        await audioEngine.play()
      } catch (err) {
        setIsPlaying(false)
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
    userTouched.current.clear()
    setRemaining(totalSeconds)
    setIsFinished(false)
    setIsPlaying(false)
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
      className="session-view"
      aria-label="声景会话"
      style={{ '--session-bg': `url(${sessionImage})` } as React.CSSProperties}
    >
      <ParticleCanvas isPlaying={isPlaying} brightness={sessionParams.brightness} />
      <div className="session-orb" aria-hidden="true">
        <svg viewBox="0 0 184 184" className="orb-ring">
          <circle cx="92" cy="92" r="90" fill="none" stroke="rgba(233,211,164,0.12)" strokeWidth="1" />
          <circle
            cx="92" cy="92" r="90"
            fill="none"
            stroke="rgba(233,211,164,0.5)"
            strokeWidth="1.5"
            strokeDasharray={`${progress * 565.5} 565.5`}
            strokeLinecap="round"
            transform="rotate(-90 92 92)"
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
          <circle cx="92" cy="92" r="40" fill="rgba(233,211,164,0.1)" />
        </svg>
      </div>

      <p className="section-kicker">Session · {phaseLabel[currentPhase]}</p>
      <h1>{MODE_DETAILS[mode].label}</h1>

      {isFinished ? (
        <p className="session-copy">一段声景结束了。</p>
      ) : isPlaying ? (
        <p className="session-copy">风从竹林来。</p>
      ) : (
        <p className="session-copy">点击播放，让声音慢慢醒来。</p>
      )}

      {errorMessage && (
        <p className="session-copy error-message" style={{ color: '#cc7a7a', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          {errorMessage}
        </p>
      )}

      <div className="countdown" aria-label={`倒计时 ${formatTime(remaining)}`}>
        {formatTime(remaining)}
      </div>

      {/* 会话中的迷你滑杆 */}
      {isPlaying && !isFinished && (
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
      )}

      <div className="session-actions">
        {isFinished ? (
          <>
            <button type="button" className="primary-action" onClick={handleRestart}>再来一次</button>
            <button type="button" className="ghost-action" onClick={handleReturn}>返回首页</button>
          </>
        ) : (
          <>
            <button type="button" className="primary-action" onClick={handlePlayPause} aria-pressed={isPlaying}>
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button type="button" className="ghost-action" onClick={handleReturn}>返回首页</button>
          </>
        )}
      </div>
    </main>
  )
}
