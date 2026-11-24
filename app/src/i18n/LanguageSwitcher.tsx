import { useI18n } from './I18nContext'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, t, setLanguage } = useI18n()
  const next = language === 'zh' ? 'en' : 'zh'
  const label = next === 'en' ? t.language.switchToEnglish : t.language.switchToChinese

  return (
    <button
      type="button"
      className={`language-switcher ${className}`.trim()}
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
    >
      {next === 'en' ? 'EN' : '中文'}
    </button>
  )
}
