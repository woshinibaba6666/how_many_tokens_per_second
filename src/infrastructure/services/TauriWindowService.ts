import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { IWindowService } from '@domain/services/IWindowService'

export class TauriWindowService implements IWindowService {
  async minimize(): Promise<void> {
    await invoke('cmd_minimize_window')
  }

  async maximize(): Promise<boolean> {
    return await invoke('cmd_maximize_window')
  }

  async close(): Promise<void> {
    await invoke('cmd_close_window')
  }

  onMaximizedChange(callback: (maximized: boolean) => void): () => void {
    let unlistenFn: (() => void) | null = null
    listen<boolean>('window-maximized-change', (event) => {
      callback(event.payload)
    }).then((fn) => {
      unlistenFn = fn
    })
    return () => {
      unlistenFn?.()
    }
  }
}
