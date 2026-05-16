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
    }
  }

  return (
    <section className="selector-block" aria-labelledby="duration-heading">
      <div className="section-kicker">Duration</div>
      <h2 id="duration-heading">选择时长</h2>
      <div className="option-grid duration-grid" role="radiogroup" aria-label="会话时长">
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
          >
            {duration}
            <span>min</span>
          </button>
        ))}
        <button
          type="button"
          className={`duration-pill duration-pill--custom ${!isPreset && !customMode ? 'is-selected' : ''} ${customMode ? 'is-editing' : ''}`}
          onClick={() => setCustomMode(true)}
          role="radio"
          aria-checked={!isPreset}
        >
          {customMode ? (
            <form
              className="custom-duration-form"
              onSubmit={(e) => {
                e.preventDefault()
                handleCustomSubmit()
              }}
            >
              <input
                type="number"
                min={1}
                max={180}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="custom-duration-input"
                placeholder="分钟"
                autoFocus
                aria-label="自定义时长（分钟）"
              />
            </form>
          ) : !isPreset ? (
            <>
              {value}
              <span>min</span>
            </>
          ) : (
            <>
              ?
              <span>min</span>
            </>
          )}
        </button>
      </div>
    </section>
  )
}
