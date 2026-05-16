export const DURATIONS = [5, 10, 20, 30] as const
export type DurationMinutes = (typeof DURATIONS)[number]

type DurationSelectorProps = {
  value: DurationMinutes
  onChange: (duration: DurationMinutes) => void
}

export function DurationSelector({ value, onChange }: DurationSelectorProps) {
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
            onClick={() => onChange(duration)}
            role="radio"
            aria-checked={value === duration}
          >
            {duration}
            <span>min</span>
          </button>
        ))}
      </div>
    </section>
  )
}
