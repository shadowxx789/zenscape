import type { SoundParams } from '../audio/soundParams'

type SliderDef = {
  key: keyof SoundParams
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderDef[] = [
  { key: 'masterVolume', label: '主音量', min: 0, max: 1, step: 0.01 },
  { key: 'natureLevel', label: '自然声', min: 0, max: 1, step: 0.01 },
  { key: 'instrumentLevel', label: '乐器', min: 0, max: 1, step: 0.01 },
  { key: 'spatialLevel', label: '空间感', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: '明亮度', min: 0, max: 1, step: 0.01 },
  // 第一听期间不暴露，验收通过后再决定是否开放：
  // { key: 'waterClarity', label: '水轮廓', min: 0, max: 0.6, step: 0.01 },
]

type SoundControlsProps = {
  params: SoundParams
  onChange: (params: SoundParams) => void
}

export function SoundControls({ params, onChange }: SoundControlsProps) {
  const handleChange = (key: keyof SoundParams, value: number) => {
    onChange({ ...params, [key]: value })
  }

  return (
    <section className="selector-block sound-controls" aria-labelledby="controls-heading">
      <div className="section-kicker">Sound</div>
      <h2 id="controls-heading">声音调节</h2>
      <div className="slider-grid">
        {SLIDERS.map((s) => (
          <div key={s.key} className="slider-row">
            <label htmlFor={`slider-${s.key}`} className="slider-label">
              {s.label}
            </label>
            <input
              id={`slider-${s.key}`}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={params[s.key]}
              onChange={(e) => handleChange(s.key, Number(e.target.value))}
              className="zen-slider"
              style={{
                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${params[s.key] * 100}%, rgba(233, 211, 164, 0.15) ${params[s.key] * 100}%)`,
              }}
              aria-label={s.label}
            />
            <span className="slider-value">
              {Math.round(params[s.key] * 100)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
