import { useEffect, useState } from 'react'
import { DurationSelector } from './components/DurationSelector'
import { MODE_DETAILS, ModeSelector } from './components/ModeSelector'
import { SessionView } from './components/SessionView'
import { SoundControls } from './components/SoundControls'
import type { SoundParams } from './audio/soundParams'
import type { Mode } from './types'
import { getModePreset } from './audio/soundscapes'
import { loadPreferences, resetPreferences, savePreferences } from './storage/preferenceStore'
import heroImage from './assets/zen-bamboo-stream.jpg'
import './App.css'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { SoundCredits } from './components/SoundCredits'

const saved = loadPreferences()

function App() {
  const [mode, setMode] = useState<Mode>(saved.mode)
  const [duration, setDuration] = useState(saved.duration)
  const [soundParams, setSoundParams] = useState<SoundParams>(saved.soundParams)
  const [isSessionActive, setIsSessionActive] = useState(false)

  useEffect(() => {
    savePreferences({ mode, duration, soundParams })
  }, [mode, duration, soundParams])

  const handleResetPreferences = () => {
    const defaults = resetPreferences()
    setMode(defaults.mode)
    setDuration(defaults.duration)
    setSoundParams(defaults.soundParams)
  }

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode)
    setSoundParams(getModePreset(nextMode).sound)
  }

  return (
    <>
      {isSessionActive ? (
        <SessionView
          mode={mode}
          duration={duration}
          soundParams={soundParams}
          onSoundParamsChange={setSoundParams}
          onReturn={() => setIsSessionActive(false)}
        />
      ) : (
        <main className="home-view">
          <img className="home-landscape" src={heroImage} alt="" aria-hidden="true" />
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
                  风、水、钟与古琴，慢慢生成一片不重复的声景。<br />
                  不必做什么，只要在这里。
                </p>
              </div>
            </section>

            <section className="setup-panel" aria-label="声景设置">
              <ModeSelector value={mode} onChange={handleModeChange} />
              <DurationSelector value={duration} onChange={setDuration} />

              <details className="sound-settings">
                <summary>细调声音</summary>
                <SoundControls params={soundParams} onChange={setSoundParams} />
              </details>

              <div className="home-actions">
                <button type="button" className="start-button" onClick={() => setIsSessionActive(true)}>
                  <span>进入声景</span>
                  <span className="start-meta">{MODE_DETAILS[mode].label} · {duration} 分钟</span>
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
