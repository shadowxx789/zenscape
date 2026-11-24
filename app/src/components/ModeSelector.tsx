import { MODES, type Mode } from '../types'
import { useI18n } from '../i18n/I18nContext'

type ModeSelectorProps = {
  value: Mode
  onChange: (mode: Mode) => void
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const { t } = useI18n()

  return (
    <section className="selector-block mode-selector" aria-labelledby="mode-heading">
      <div className="selector-heading">
        <h2 id="mode-heading">{t.modes.heading}</h2>
      </div>
      <div className="option-grid mode-grid" role="radiogroup" aria-label={t.modes.groupLabel}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={`option-card ${value === mode ? 'is-selected' : ''}`}
            onClick={() => onChange(mode)}
            role="radio"
            aria-checked={value === mode}
          >
            <span className="option-label">{t.modes.items[mode].label}</span>
          </button>
        ))}
      </div>
      <p className="mode-description" aria-live="polite">{t.modes.items[value].description}</p>
    </section>
  )
}
