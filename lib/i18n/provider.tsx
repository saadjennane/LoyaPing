'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { getTranslation, interpolate, Translations } from './index'
import en from './locales/en.json'

// ─── Types ────────────────────────────────────────────────────────────────────

type Language = 'en'

type I18nContextType = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

// ─── Context ──────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextType | null>(null)

const LOCALES: Record<Language, Translations> = { en: en as unknown as Translations }

// ─── Provider ─────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const str = getTranslation(LOCALES[language], key)
    return vars ? interpolate(str, vars) : str
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
