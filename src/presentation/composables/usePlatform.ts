import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export type Platform = 'macos' | 'windows' | 'linux'

const platform = ref<Platform>('windows')
const isMac = ref(false)
const isWindows = ref(true)

let initialized = false

async function detectPlatform(): Promise<void> {
  if (initialized) return
  try {
    const os = await invoke<string>('cmd_platform')
    platform.value = os as Platform
    isMac.value = os === 'macos'
    isWindows.value = os === 'windows'
    initialized = true
  } catch {
    // Fallback: assume Windows in browser dev mode
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac')) {
      platform.value = 'macos'
      isMac.value = true
      isWindows.value = false
    }
    initialized = true
  }
}

export function usePlatform() {
  onMounted(() => {
    detectPlatform()
  })

  // If already initialized synchronously (e.g. browser fallback), return immediately
  if (!initialized) {
    detectPlatform()
  }

  return {
    platform,
    isMac,
    isWindows,
  }
}
