import type { Density } from '../audio/engine'
import { DENSITIES, DENSITY_DETAILS } from './density'

type DensitySelectorProps = {
  value: Density
  onChange: (density: Density) => void
}

export function DensitySelector({ value, onChange }: DensitySelectorProps) {
  return (
    <section className="selector-block density-selector" aria-labelledby="density-heading">
      <div className="selector-heading">
        <h2 id="density-heading">声音几分</h2>
      </div>
      <div className="option-grid density-grid" role="radiogroup" aria-label="声音疏密">
        {DENSITIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`option-card ${value === d ? 'is-selected' : ''}`}
            onClick={() => onChange(d)}
            role="radio"
            aria-checked={value === d}
          >
            <span className="option-label">{DENSITY_DETAILS[d].label}</span>
          </button>
        ))}
      </div>
      <p className="mode-description" aria-live="polite">{DENSITY_DETAILS[value].description}</p>
    </section>
  )
}
