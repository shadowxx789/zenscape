import { useEffect, useState } from 'react'
import { DurationSelector } from './components/DurationSelector'
import { MODE_DETAILS, ModeSelector } from './components/ModeSelector'
import { DensitySelector } from './components/DensitySelector'
import { DENSITY_DETAILS } from './components/density'
import { SessionView } from './components/SessionView'
import type { Density } from './audio/engine'
import type { Mode } from './types'
import { loadPreferences, resetPreferences, savePreferences } from './storage/preferenceStore'
import heroImage from './assets/zen-bamboo-stream.jpg'
import heroImageAvif from './assets/zen-bamboo-stream.avif'
import './App.css'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { SoundCredits } from './components/SoundCredits'

const saved = loadPreferences()

function App() {
  const [mode, setMode] = useState<Mode>(saved.mode)
  const [duration, setDuration] = useState(saved.duration)
  const [density, setDensity] = useState<Density>(saved.density)
  const [isSessionActive, setIsSessionActive] = useState(false)

  useEffect(() => {
    savePreferences({ mode, duration, density })
  }, [mode, duration, density])

  const handleResetPreferences = () => {
    const defaults = resetPreferences()
    setMode(defaults.mode)
    setDuration(defaults.duration)
    setDensity(defaults.density)
  }

  return (
    <>
      {isSessionActive ? (
        <SessionView
          mode={mode}
          duration={duration}
          density={density}
          onReturn={() => setIsSessionActive(false)}
        />
      ) : (
        <main className="home-view">
          <picture className="home-landscape-frame" aria-hidden="true">
            <source srcSet={heroImageAvif} type="image/avif" />
            <img className="home-landscape" src={heroImage} alt="" />
          </picture>
          <div className="grain" aria-hidden="true" />
          <div className="home-veil" aria-hidden="true" />

          <header className="home-header">
            <div className="brand-lockup" aria-label="竹间息 BreezeScape">
              <span className="brand-name">竹间息</span>
              <span className="brand-sub">BREEZESCAPE</span>
            </div>
            <p className="header-note">生成式冥想声景</p>
          </header>

          <div className="home-layout">
            <section className="hero-panel" aria-labelledby="app-title">
              <div className="hero-content">
                <p className="section-kicker">风过竹林 · 水落石间</p>
                <h1 id="app-title">且坐，<br />听风。</h1>
                <p className="hero-copy">
                  <span className="nowrap">风、水、钟与古琴，</span><span className="nowrap">慢慢生成一片不重复的声景。</span><br />
                  <span className="nowrap">不必做什么，</span><span className="nowrap">只要在这里。</span>
                </p>
              </div>
            </section>

            <section className="setup-panel" aria-label="声景设置">
              <ModeSelector value={mode} onChange={setMode} />
              <DurationSelector value={duration} onChange={setDuration} />
              <DensitySelector value={density} onChange={setDensity} />

              <div className="home-actions">
                <button type="button" className="start-button" onClick={() => setIsSessionActive(true)}>
                  <span>进入声景</span>
                  <span className="start-meta">
                    {MODE_DETAILS[mode].label} · {duration} 分钟 · {DENSITY_DETAILS[density].label}
                  </span>
                </button>
                <button type="button" className="reset-button" onClick={handleResetPreferences}>
                  恢复默认
                </button>
              </div>
            </section>
          </div>

          <footer className="home-footer">
            <SoundCredits />
          </footer>
        </main>
      )}
      <DiagnosticsPanel />
    </>
  )
}

export default App
