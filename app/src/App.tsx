import { useState } from 'react'
import { DurationSelector } from './components/DurationSelector'
import { ModeSelector } from './components/ModeSelector'
import { SessionView } from './components/SessionView'
import { SoundControls } from './components/SoundControls'
import { DEFAULT_PARAMS, type SoundParams } from './audio/soundParams'
import type { Mode } from './types'
import './App.css'

function App() {
  const [mode, setMode] = useState<Mode>('meditate')
  const [duration, setDuration] = useState(10)
  const [soundParams, setSoundParams] = useState<SoundParams>(DEFAULT_PARAMS)
  const [isSessionActive, setIsSessionActive] = useState(false)

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
        <p className="section-kicker">ZenScape</p>
        <h1 id="app-title">禅音 ZenScape</h1>
        <p className="hero-copy">
          选择一个场景，让风、水、钟与古琴慢慢生成一段不急着结束的安静。
        </p>
      </section>

      <ModeSelector value={mode} onChange={setMode} />
      <DurationSelector value={duration} onChange={setDuration} />
      <SoundControls params={soundParams} onChange={setSoundParams} />

      <button type="button" className="start-button" onClick={() => setIsSessionActive(true)}>
        开始声景
      </button>
    </main>
  )
}

export default App
