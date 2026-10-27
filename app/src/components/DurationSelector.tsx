import { useState } from 'react'
import { DURATIONS } from './duration'

export type DurationMinutes = number

type DurationSelectorProps = {
  value: number
  onChange: (duration: number) => void
}

export function DurationSelector({ value, onChange }: DurationSelectorProps) {
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const isPreset = (DURATIONS as readonly number[]).includes(value)

  const handleCustomSubmit = () => {
    const n = parseInt(customValue, 10)
    if (n > 0 && n <= 180) {
      onChange(n)
      setCustomMode(false)
      setCustomValue('')
    }
  }

  return (
    <section className="selector-block duration-selector" aria-labelledby="duration-heading">
      <div className="selector-heading">
        <h2 id="duration-heading">留多久</h2>
        <span className="selector-note">分钟</span>
      </div>
      <div className="option-grid duration-grid" role="radiogroup" aria-label="会话时长（分钟）">
        {DURATIONS.map((duration) => (
          <button
            key={duration}
            type="button"
            className={`duration-pill ${value === duration ? 'is-selected' : ''}`}
            onClick={() => {
              onChange(duration)
              setCustomMode(false)
            }}
            role="radio"
            aria-checked={value === duration}
            aria-label={`${duration} 分钟`}
          >
            {duration}
          </button>
        ))}
        {customMode ? (
          <form
            className="custom-duration-form duration-pill is-editing"
            onSubmit={(e) => {
              e.preventDefault()
              handleCustomSubmit()
            }}
          >
            <input
              type="number"
              min={1}
              max={180}
              inputMode="numeric"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="custom-duration-input"
              placeholder="1–180"
              autoFocus
              aria-label="自定义时长（分钟）"
            />
            <button type="submit" className="custom-duration-submit" aria-label="确认自定义时长">
              确定
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={`duration-pill duration-pill--custom ${!isPreset ? 'is-selected' : ''}`}
            onClick={() => setCustomMode(true)}
            role="radio"
            aria-checked={!isPreset}
            aria-label={!isPreset ? `自定义 ${value} 分钟` : '自定义时长'}
          >
            {!isPreset ? value : '自定'}
          </button>
        )}
      </div>
    </section>
  )
}
