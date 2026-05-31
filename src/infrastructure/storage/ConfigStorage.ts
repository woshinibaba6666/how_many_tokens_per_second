import { invoke } from '@tauri-apps/api/core'
import type { AppConfig } from '@/domain/entities'
import type { IConfigRepository } from '@/domain/repositories'

export class ConfigStorage implements IConfigRepository {
  async load(): Promise<AppConfig> {
    try {
      const value = await invoke<Record<string, unknown>>('cmd_load_config')
      // Backend returns the full config.json object
      if (value && Array.isArray(value.configs)) {
        return value as unknown as AppConfig
      }
      return { configs: [] }
    } catch (error) {
      console.error('Failed to load config from file:', error)
      // Fallback to localStorage if Tauri command is not available (e.g. in browser)
      try {
        const data = localStorage.getItem('token-speed-test-configs')
        if (!data) return { configs: [] }
        const parsed = JSON.parse(data)
        // Backward compat: old format was just an array
        if (Array.isArray(parsed)) return { configs: parsed }
        return parsed as AppConfig
      } catch {
        return { configs: [] }
      }
    }
  }

  async save(config: AppConfig): Promise<void> {
    try {
      await invoke('cmd_save_config', { config })
      return
    } catch (error) {
      console.error('Failed to save config to file:', error)
      // Fallback to localStorage if Tauri command is not available
      localStorage.setItem('token-speed-test-configs', JSON.stringify(config))
    }
  }
}
