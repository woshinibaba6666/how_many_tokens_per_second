import { ref } from 'vue'

export type Platform = 'macos' | 'windows' | 'linux'

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  return 'linux'
}

const platform = ref<Platform>(detectPlatform())
const isMac = ref(platform.value === 'macos')
const isWindows = ref(platform.value === 'windows')

export function usePlatform() {
  return { platform, isMac, isWindows }
}
