import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nContextValue } from './I18nContext'
import { detectBrowserLanguage, loadLanguage, saveLanguage, type Language } from './language'
import { translations } from './translations'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => loadLanguage() ?? 'zh')
  const [suggestedLanguage, setSuggestedLanguage] = useState<Language | null>(() => {
    if (loadLanguage()) return null
    const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language]
    const suggestion = detectBrowserLanguage(browserLanguages)
    return suggestion === language ? null : suggestion
  })

  const setLanguage = useCallback((next: Language) => {
    saveLanguage(next)
    setLanguageState(next)
    setSuggestedLanguage(null)
  }, [])

  const dismissSuggestion = useCallback(() => {
    // 关闭或选择“保持现状”也算用户做过决定，之后不再反复提示。
    saveLanguage(language)
    setSuggestedLanguage(null)
  }, [language])

  useEffect(() => {
    const t = translations[language]
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = t.meta.title
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', t.meta.description)
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t.meta.appTitle)
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    t: translations[language],
    suggestedLanguage,
    setLanguage,
    dismissSuggestion,
  }), [language, suggestedLanguage, setLanguage, dismissSuggestion])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
