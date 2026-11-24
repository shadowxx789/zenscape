export type Language = 'zh' | 'en'

export const LANGUAGE_STORAGE_KEY = 'zenscape:language'

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>

export function parseLanguage(value: unknown): Language | null {
  return value === 'zh' || value === 'en' ? value : null
}

/** 以浏览器首选语言为准；中文以外一律建议英文，不擅自替换用户已保存的选择。 */
export function detectBrowserLanguage(languages: readonly string[], fallback = 'en-US'): Language {
  const primary = languages.find((item) => item.trim().length > 0) ?? fallback
  return primary.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function loadLanguage(storage: LanguageStorage = localStorage): Language | null {
  try {
    return parseLanguage(storage.getItem(LANGUAGE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveLanguage(language: Language, storage: LanguageStorage = localStorage): void {
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // 隐私模式或存储已满时，语言仍在当前页面生效。
  }
}
