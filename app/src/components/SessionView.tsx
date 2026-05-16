import { useMemo, useState } from 'react'
import { MODE_DETAILS } from './ModeSelector'
import type { DurationMinutes } from './DurationSelector'
import type { Mode } from '../types'

type SessionViewProps = {
  mode: Mode
  duration: DurationMinutes
  onReturn: () => void
}

function formatDuration(minutes: number) {
  return `${String(minutes).padStart(2, '0')}:00`
}

export function SessionView({ mode, duration, onReturn }: SessionViewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const countdown = useMemo(() => formatDuration(duration), [duration])

  return (
    <main className="session-view" aria-label="声景会话">
      <div className="session-orb" aria-hidden="true">
        <span />
      </div>
      <p className="section-kicker">Session</p>
      <h1>{MODE_DETAILS[mode].label}</h1>
      <p className="session-copy">音频引擎尚未接入。此处先保留仪式感，像一口安静的井。</p>

      <div className="countdown" aria-label={`初始倒计时 ${duration} 分钟`}>
        {countdown}
      </div>

      <div className="session-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => setIsPlaying((playing) => !playing)}
          aria-pressed={isPlaying}
        >
          {isPlaying ? '暂停' : '播放'}
        </button>
        <button type="button" className="ghost-action" onClick={onReturn}>
          返回首页
        </button>
      </div>
    </main>
  )
}
