import type { Mode } from '../types'

const MODE_DETAILS: Record<Mode, { label: string; description: string }> = {
  meditate: {
    label: '静坐',
    description: '风声很轻，钟声偶尔掠过。',
  },
  sleep: {
    label: '入睡',
    description: '更暗、更慢，像水把一天收走。',
  },
  focus: {
    label: '专注',
    description: '低频稳定，留一点清醒的光。',
  },
}

type ModeSelectorProps = {
  value: Mode
  onChange: (mode: Mode) => void
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <section className="selector-block mode-selector" aria-labelledby="mode-heading">
      <div className="selector-heading">
        <h2 id="mode-heading">此刻，想要</h2>
      </div>
      <div className="option-grid mode-grid" role="radiogroup" aria-label="冥想模式">
        {(Object.keys(MODE_DETAILS) as Mode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`option-card ${value === mode ? 'is-selected' : ''}`}
            onClick={() => onChange(mode)}
            role="radio"
            aria-checked={value === mode}
          >
            <span className="option-mark" aria-hidden="true" />
            <span className="option-label">{MODE_DETAILS[mode].label}</span>
          </button>
        ))}
      </div>
      <p className="mode-description" aria-live="polite">{MODE_DETAILS[value].description}</p>
    </section>
  )
}

export { MODE_DETAILS }
