import { useCallback, useEffect, useRef, useState } from 'react'
import { MODE_DETAILS } from './ModeSelector'
import type { DurationMinutes } from './duration'
import type { Mode } from '../types'
import { audioEngine } from '../audio/AudioEngine'

type SessionViewProps = {
  mode: Mode
  duration: DurationMinutes
  onReturn: () => void
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionView({ mode, duration, onReturn }: SessionViewProps) {
  const totalSeconds = duration * 60
  const [remaining, setRemaining] = useState(totalSeconds)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 倒计时逻辑
  useEffect(() => {
    if (isPlaying && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearTimer()
            setIsPlaying(false)
            setIsFinished(true)
            audioEngine.stop() // 时间到，淡出
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return clearTimer
  }, [isPlaying, clearTimer, remaining])

  // 组件卸载时清理音频
  useEffect(() => {
    return () => {
      audioEngine.stopImmediate()
    }
  }, [])

  const handlePlayPause = async () => {
    if (isFinished) return

    if (isPlaying) {
      setIsPlaying(false)
      audioEngine.stop() // 3 秒淡出
    } else {
      setIsPlaying(true)
      await audioEngine.play() // 3 秒淡入
    }
  }

  const handleReturn = () => {
    audioEngine.stopImmediate()
    onReturn()
  }

  const handleRestart = () => {
    audioEngine.stopImmediate()
    setRemaining(totalSeconds)
    setIsFinished(false)
    setIsPlaying(false)
  }

  const progress = 1 - remaining / totalSeconds

  return (
    <main className="session-view" aria-label="声景会话">
      <div className="session-orb" aria-hidden="true">
        <svg viewBox="0 0 184 184" className="orb-ring">
          <circle
            cx="92" cy="92" r="90"
            fill="none"
            stroke="rgba(233,211,164,0.12)"
            strokeWidth="1"
          />
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

      <p className="section-kicker">Session</p>
      <h1>{MODE_DETAILS[mode].label}</h1>

      {isFinished ? (
        <p className="session-copy">一段声景结束了。</p>
      ) : isPlaying ? (
        <p className="session-copy">风从竹林来。</p>
      ) : (
        <p className="session-copy">点击播放，让声音慢慢醒来。</p>
      )}

      <div className="countdown" aria-label={`倒计时 ${formatTime(remaining)}`}>
        {formatTime(remaining)}
      </div>

      <div className="session-actions">
        {isFinished ? (
          <>
            <button type="button" className="primary-action" onClick={handleRestart}>
              再来一次
            </button>
            <button type="button" className="ghost-action" onClick={handleReturn}>
              返回首页
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary-action"
              onClick={handlePlayPause}
              aria-pressed={isPlaying}
            >
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button type="button" className="ghost-action" onClick={handleReturn}>
              返回首页
            </button>
          </>
        )}
      </div>
    </main>
  )
}
