import { useEffect, useState } from 'react'
import { DurationSelector } from './components/DurationSelector'
import { ModeSelector } from './components/ModeSelector'
import { DensitySelector } from './components/DensitySelector'
import { SessionView } from './components/SessionView'
import type { Density } from './audio/engine'
import type { Mode } from './types'
import { DEFAULT_PREFS, loadPreferences, resetPreferences, savePreferences } from './storage/preferenceStore'
import heroImage from './assets/zen-bamboo-stream.jpg'
import heroImageAvif from './assets/zen-bamboo-stream.avif'
import heroMobileJpg from './assets/zen-bamboo-stream-mobile.jpg'
import heroMobileAvif from './assets/zen-bamboo-stream-mobile.avif'
import './App.css'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { SoundCredits } from './components/SoundCredits'
import { LivingBackdrop } from './components/livingBackdrop/LivingBackdrop'
import { useI18n } from './i18n/I18nContext'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'
import { LanguagePrompt } from './i18n/LanguagePrompt'

/** 读首页 <img> 实际用的图和 object-position，让动态层与静态层完全对齐 */
const homeImg = () => document.querySelector<HTMLImageElement>('.home-landscape')
const homeSrc = () => {
  const img = homeImg()
  return img ? img.currentSrc || img.src : null
}
const homeFocus = (): [number, number] => {
  const img = homeImg()
  const pos = img ? getComputedStyle(img).objectPosition.split(' ') : []
  const pct = (v: string | undefined) => (v && v.endsWith('%') ? parseFloat(v) / 100 : 0.5)
  return [pct(pos[0]), pct(pos[1])]
}

const saved = loadPreferences()

/** 首页淡出的时长；之后计时页再自己淡入 */
const ENTER_MS = 900
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function App() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>(saved.mode)
  const [duration, setDuration] = useState(saved.duration)
  const [density, setDensity] = useState<Density>(saved.density)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [isLeavingHome, setIsLeavingHome] = useState(false)
  const [homeLive, setHomeLive] = useState(false)

  useEffect(() => {
    savePreferences({ mode, duration, density })
  }, [mode, duration, density])

  const handleResetPreferences = () => {
    const defaults = resetPreferences()
    setMode(defaults.mode)
    setDuration(defaults.duration)
    setDensity(defaults.density)
  }

  const isDefault =
    mode === DEFAULT_PREFS.mode && duration === DEFAULT_PREFS.duration && density === DEFAULT_PREFS.density

  const handleEnter = () => {
    if (isLeavingHome) return
    setIsLeavingHome(true)
    window.setTimeout(() => {
      setIsSessionActive(true)
      setIsLeavingHome(false)
    }, reducedMotion() ? 0 : ENTER_MS)
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
        <main className={['home-view', isLeavingHome && 'is-leaving', homeLive && 'has-living'].filter(Boolean).join(' ')}>
          <picture className="home-landscape-frame" aria-hidden="true">
            <source media="(max-width: 600px)" srcSet={heroMobileAvif} type="image/avif" />
            <source media="(max-width: 600px)" srcSet={heroMobileJpg} type="image/jpeg" />
            <source srcSet={heroImageAvif} type="image/avif" />
            <img className="home-landscape" src={heroImage} alt="" />
          </picture>
          <LivingBackdrop scene="bamboo" className="home-living" getSrc={homeSrc} getFocus={homeFocus} onReady={setHomeLive} />
          <div className="grain" aria-hidden="true" />
          <div className="home-veil" aria-hidden="true" />

          <header className="home-header">
            <div className="brand-lockup" aria-label={t.brand.aria}>
              <span className="brand-name">{t.brand.name}</span>
              <span className="brand-sub">{t.brand.sub}</span>
            </div>
            <div className="header-tools">
              <p className="header-note">{t.brand.note}</p>
              <LanguageSwitcher />
            </div>
          </header>

          <div className="home-layout">
            <section className="hero-panel" aria-labelledby="app-title">
              <div className="hero-content">
                <p className="section-kicker">{t.home.kicker}</p>
                <h1 id="app-title">{t.home.titleFirst}<br />{t.home.titleSecond}</h1>
                <p className="hero-copy">
                  <span className="nowrap">{t.home.copyFirstA}</span><span className="nowrap">{t.home.copyFirstB}</span><br />
                  <span className="nowrap">{t.home.copySecondA}</span><span className="nowrap">{t.home.copySecondB}</span>
                </p>
              </div>
            </section>

            <section className="setup-panel" aria-label={t.home.setupLabel}>
              <ModeSelector value={mode} onChange={setMode} />
              <DurationSelector value={duration} onChange={setDuration} />
              <DensitySelector value={density} onChange={setDensity} />

              <div className="home-actions">
                <button type="button" className="start-button" onClick={handleEnter}>
                  <span>{t.home.start}</span>
                  <span className="start-meta">
                    {t.modes.items[mode].label} · {t.duration.minutes(duration)} · {t.density.items[density].label}
                  </span>
                </button>
                <button
                  type="button"
                  className={`reset-button ${isDefault ? 'is-quiet' : ''}`}
                  onClick={handleResetPreferences}
                  aria-hidden={isDefault}
                  tabIndex={isDefault ? -1 : 0}
                >
                  {t.home.reset}
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
      <LanguagePrompt />
    </>
  )
}

export default App
