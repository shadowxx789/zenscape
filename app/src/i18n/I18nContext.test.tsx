// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useI18n } from './I18nContext'
import { I18nProvider } from './I18nProvider'
import { LanguagePrompt } from './LanguagePrompt'
import { LanguageSwitcher } from './LanguageSwitcher'
import { LANGUAGE_STORAGE_KEY } from './language'

function Harness() {
  const { language, t } = useI18n()
  return (
    <>
      <output data-testid="current">{language}:{t.home.start}</output>
      <LanguageSwitcher />
      <LanguagePrompt />
    </>
  )
}

describe('browser language suggestion', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = () => {
    act(() => {
      root.render(<I18nProvider><Harness /></I18nProvider>)
    })
  }

  const click = (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find((item) =>
      item.textContent === label || item.getAttribute('aria-label') === label,
    )
    expect(button, `button: ${label}`).toBeDefined()
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => ['en-US', 'en'] })
    Object.defineProperty(window.navigator, 'language', { configurable: true, get: () => 'en-US' })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('suggests English once, applies the whole UI and remembers the choice', () => {
    mount()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('zh:进入声景')

    click('Use English')
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('en:Enter the soundscape')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toContain('BreezeScape')

    act(() => root.unmount())
    root = createRoot(container)
    mount()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('en:Enter the soundscape')
  })

  it('remembers Stay in Chinese and does not prompt again', () => {
    mount()
    click('Stay in Chinese')
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('zh:进入声景')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh')

    act(() => root.unmount())
    root = createRoot(container)
    mount()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('remembers dismissing the prompt with Escape', () => {
    mount()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh')
  })

  it('does not prompt when Chinese is already the primary browser language', () => {
    Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => ['zh-CN', 'en-US'] })
    mount()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('zh:进入声景')
  })

  it('keeps the manual switch available without showing a saved-choice prompt', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    mount()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    click('Switch to English')
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('en:Enter the soundscape')
    click('切换到中文')
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe('zh:进入声景')
  })
})
