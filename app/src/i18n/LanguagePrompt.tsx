import { useEffect } from 'react'
import { useI18n } from './I18nContext'
import { translations } from './translations'

export function LanguagePrompt() {
  const { suggestedLanguage, setLanguage, dismissSuggestion } = useI18n()

  useEffect(() => {
    if (!suggestedLanguage) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissSuggestion()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [suggestedLanguage, dismissSuggestion])

  if (!suggestedLanguage) return null
  const t = translations[suggestedLanguage].language

  return (
    <aside className="language-prompt" role="dialog" aria-labelledby="language-prompt-title" aria-describedby="language-prompt-body">
      <button type="button" className="language-prompt-close" onClick={dismissSuggestion} aria-label={t.promptClose}>×</button>
      <p className="language-prompt-kicker">BREEZESCAPE</p>
      <h2 id="language-prompt-title">{t.promptTitle}</h2>
      <p id="language-prompt-body">{t.promptBody}</p>
      <div className="language-prompt-actions">
        <button type="button" className="language-prompt-confirm" onClick={() => setLanguage(suggestedLanguage)}>{t.promptConfirm}</button>
        <button type="button" className="language-prompt-dismiss" onClick={dismissSuggestion}>{t.promptDismiss}</button>
      </div>
    </aside>
  )
}
