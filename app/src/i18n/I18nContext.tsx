import { createContext, useContext } from 'react'
import type { Language } from './language'
import type { Translations } from './translations'

export type I18nContextValue = {
  language: Language
  t: Translations
  suggestedLanguage: Language | null
  setLanguage: (language: Language) => void
  dismissSuggestion: () => void
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used within I18nProvider')
  return value
}
