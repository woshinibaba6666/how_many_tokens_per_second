import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export type Locale = 'zh-CN' | 'en-US'

function detectLocale(): Locale {
  const systemLang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage || 'en-US'
  // Chinese variants (including TW, HK) all map to Simplified Chinese
  if (systemLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

const defaultLocale = detectLocale()

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
}

function getLocale(): Locale {
  return i18n.global.locale.value as Locale
}

export function toggleLocale(): Locale {
  const newLocale = getLocale() === 'zh-CN' ? 'en-US' : 'zh-CN'
  setLocale(newLocale)
  return newLocale
}
