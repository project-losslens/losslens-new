import { useSyncExternalStore } from 'react'
import en from './en.js'
import sw from './sw.js'

const dictionaries = { en, sw }
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
]

const STORAGE_KEY = 'losslens_language'
const CHANGE_EVENT = 'losslens:language-change'

function detectInitialLanguage() {
  if (typeof window === 'undefined') return 'en'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'sw' || saved === 'en') return saved
  const nav = window.navigator?.language || ''
  return nav.toLowerCase().startsWith('sw') ? 'sw' : 'en'
}

let currentLanguage = detectInitialLanguage()
const listeners = new Set()

function applyLanguage(lang) {
  currentLanguage = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export function getLanguage() {
  return currentLanguage
}

export function setLanguage(lang) {
  const next = lang === 'sw' ? 'sw' : 'en'
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
  applyLanguage(next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      applyLanguage(event.newValue === 'sw' ? 'sw' : 'en')
      listener()
    }
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match))
}

export function translate(lang, key, vars) {
  const dict = dictionaries[lang] || dictionaries.en
  const template = dict[key] ?? dictionaries.en[key] ?? key
  return interpolate(template, vars)
}

export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLanguage, () => 'en')
  const t = (key, vars) => translate(lang, key, vars)
  return { lang, t, setLanguage }
}

applyLanguage(currentLanguage)
