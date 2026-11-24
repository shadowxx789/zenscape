import { useState } from 'react'
import { DURATIONS } from './duration'
import { useI18n } from '../i18n/I18nContext'

export type DurationMinutes = number

type DurationSelectorProps = {
  value: number
  onChange: (duration: number) => void
}

export function DurationSelector({ value, onChange }: DurationSelectorProps) {
  const { t } = useI18n()
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
        <h2 id="duration-heading">{t.duration.heading}</h2>
        <span className="selector-note">{t.duration.unit}</span>
      </div>
      <div className="option-grid duration-grid" role="radiogroup" aria-label={t.duration.groupLabel}>
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
            aria-label={t.duration.minutes(duration)}
          >
            <span className="duration-value">{duration}</span>
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
              aria-label={t.duration.customInput}
            />
            <button type="submit" className="custom-duration-submit" aria-label={t.duration.confirmLabel}>
              {t.duration.confirm}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={`duration-pill duration-pill--custom ${!isPreset ? 'is-selected' : ''}`}
            onClick={() => setCustomMode(true)}
            role="radio"
            aria-checked={!isPreset}
            aria-label={!isPreset ? t.duration.customValue(value) : t.duration.customLabel}
          >
            <span className="duration-value">{!isPreset ? value : t.duration.custom}</span>
          </button>
        )}
      </div>
    </section>
  )
}
