import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { i18n } from '@/presentation/i18n'
import '@/presentation/styles/global.scss'

declare global {
  interface Window {
    __DEBUG_API__: boolean
    debugApi: (enabled: boolean) => void
  }
}

// Global debug state for API logging
window.__DEBUG_API__ = false
window.debugApi = (enabled: boolean) => {
  window.__DEBUG_API__ = enabled
  console.log(`[debugApi] API debug logging ${enabled ? 'enabled' : 'disabled'}`)
}

// F12 to toggle DevTools (works in both debug and release builds)
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F12') {
    e.preventDefault()
    invoke('cmd_toggle_devtools')
  }
})

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(ElementPlus)

app.mount('#app')
