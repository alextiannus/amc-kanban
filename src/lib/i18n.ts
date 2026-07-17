'use client'

import { useCallback, useEffect, useState } from 'react'

export type UiLanguage = 'zh' | 'en'

const STORAGE_KEY = 'amc.ui.language'
const LANGUAGE_EVENT = 'amc-ui-language-change'

function normalizeLanguage(value: string | null | undefined): UiLanguage {
  return value === 'en' ? 'en' : 'zh'
}

function getStoredLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'zh'
  return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY))
}

export function setStoredLanguage(language: UiLanguage) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, language)
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: language }))
}

export function useI18n() {
  const [language, setLanguageState] = useState<UiLanguage>('zh')

  useEffect(() => {
    setLanguageState(getStoredLanguage())

    const handleLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<UiLanguage>).detail
      setLanguageState(normalizeLanguage(detail))
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLanguageState(normalizeLanguage(event.newValue))
    }

    window.addEventListener(LANGUAGE_EVENT, handleLanguageChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const setLanguage = useCallback((next: UiLanguage) => {
    setStoredLanguage(next)
    setLanguageState(next)
  }, [])

  const t = useCallback((zh: string, en: string) => {
    return language === 'en' ? en : zh
  }, [language])

  return {
    language,
    isEn: language === 'en',
    setLanguage,
    t,
  }
}
