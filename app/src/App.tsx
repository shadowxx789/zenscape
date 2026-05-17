import { useEffect, useState } from 'react'
import { DurationSelector } from './components/DurationSelector'
import { ModeSelector } from './components/ModeSelector'
import { SessionView } from './components/SessionView'
import { SoundControls } from './components/SoundControls'
import type { SoundParams } from './audio/soundParams'
import type { Mode } from './types'
import { loadPreferences, resetPreferences, savePreferences } from './storage/preferenceStore'
import heroImage from './assets/zen-bamboo-stream.jpg'
import './App.css'

// 启动时加载保存的偏好
const saved = loadPreferences()

function App() {
  const [mode, setMode] = useState<Mode>(saved.mode)
  const [duration, setDuration] = useState(saved.duration)
  const [soundParams, setSoundParams] = useState<SoundParams>(saved.soundParams)
  const [isSessionActive, setIsSessionActive] = useState(false)

  // 偏好变更时自动保存
  useEffect(() => {
    savePreferences({ mode, duration, soundParams })
  }, [mode, duration, soundParams])

  const handleResetPreferences = () => {
    const defaults = resetPreferences()
    setMode(defaults.mode)
    setDuration(defaults.duration)
    setSoundParams(defaults.soundParams)
  }

  if (isSessionActive) {
    return (
      <SessionView
        mode={mode}
        duration={duration}
        soundParams={soundParams}
        onSoundParamsChange={setSoundParams}
        onReturn={() => setIsSessionActive(false)}
      />
    )
  }

  return (
    <main className="home-view">
      <section className="hero-panel" aria-labelledby="app-title">
        <img className="hero-image" src={heroImage} alt="" aria-hidden="true" />
        <div className="hero-content">
          <p className="section-kicker">ZenScape</p>
          <h1 id="app-title">禅音 ZenScape</h1>
          <p className="hero-copy">
            选择一个场景，让风、水、钟与古琴慢慢生成一段不急着结束的安静。
          </p>
        </div>
      </section>

      <div className="setup-stack">
        <ModeSelector value={mode} onChange={setMode} />
        <DurationSelector value={duration} onChange={setDuration} />
        <SoundControls params={soundParams} onChange={setSoundParams} />
      </div>

      <div className="home-actions">
        <button type="button" className="ghost-action reset-button" onClick={handleResetPreferences}>
          恢复默认
        </button>

        <button type="button" className="start-button" onClick={() => setIsSessionActive(true)}>
          开始声景
        </button>
      </div>
    </main>
  )
}

export default App
