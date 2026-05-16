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
    <section className="selector-block" aria-labelledby="mode-heading">
      <div className="section-kicker">Mode</div>
      <h2 id="mode-heading">选择声景</h2>
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
            <span>{MODE_DETAILS[mode].label}</span>
            <small>{MODE_DETAILS[mode].description}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

export { MODE_DETAILS }
