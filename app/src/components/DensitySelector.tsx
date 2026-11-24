import type { Density } from '../audio/engine'
import { DENSITIES } from './density'
import { useI18n } from '../i18n/I18nContext'

type DensitySelectorProps = {
  value: Density
  onChange: (density: Density) => void
}

export function DensitySelector({ value, onChange }: DensitySelectorProps) {
  const { t } = useI18n()

  return (
    <section className="selector-block density-selector" aria-labelledby="density-heading">
      <div className="selector-heading">
        <h2 id="density-heading">{t.density.heading}</h2>
      </div>
      <div className="option-grid density-grid" role="radiogroup" aria-label={t.density.groupLabel}>
        {DENSITIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`option-card ${value === d ? 'is-selected' : ''}`}
            onClick={() => onChange(d)}
            role="radio"
            aria-checked={value === d}
          >
            <span className="option-label">{t.density.items[d].label}</span>
          </button>
        ))}
      </div>
      <p className="mode-description" aria-live="polite">{t.density.items[value].description}</p>
    </section>
  )
}
