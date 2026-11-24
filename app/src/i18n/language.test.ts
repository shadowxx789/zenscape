import { describe, expect, it } from 'vitest'
import { detectBrowserLanguage, LANGUAGE_STORAGE_KEY, loadLanguage, parseLanguage, saveLanguage } from './language'

describe('language preference', () => {
  it('uses only the primary browser language for the suggestion', () => {
    expect(detectBrowserLanguage(['en-US', 'zh-CN'])).toBe('en')
    expect(detectBrowserLanguage(['zh-Hant-TW', 'en-US'])).toBe('zh')
    expect(detectBrowserLanguage(['fr-FR', 'en-US'])).toBe('en')
  })

  it('falls back safely when browser languages are unavailable', () => {
    expect(detectBrowserLanguage([], 'zh-CN')).toBe('zh')
    expect(detectBrowserLanguage(['', '  '], 'en-US')).toBe('en')
  })

  it('rejects malformed persisted values', () => {
    expect(parseLanguage('zh')).toBe('zh')
    expect(parseLanguage('en')).toBe('en')
    expect(parseLanguage('en-US')).toBeNull()
    expect(parseLanguage('')).toBeNull()
    expect(parseLanguage(null)).toBeNull()
  })

  it('saves and reloads an explicit choice without JSON encoding', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    saveLanguage('en', storage)
    expect(values.get(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(loadLanguage(storage)).toBe('en')
  })

  it('treats unavailable storage as no saved choice', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadLanguage(storage)).toBeNull()
    expect(() => saveLanguage('zh', storage)).not.toThrow()
  })
})
