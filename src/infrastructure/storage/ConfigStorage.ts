import { invoke } from '@tauri-apps/api/core'
import type { TestConfig } from '@/domain/entities'
import type { IConfigRepository } from '@/domain/repositories'

export class ConfigStorage implements IConfigRepository {
  async load(): Promise<TestConfig[]> {
    try {
      const value = await invoke<Record<string, unknown>>('cmd_load_config')
      // Backend returns a JSON object; if it has a 'configs' array, use it
      if (value && Array.isArray(value.configs)) {
        return value.configs as TestConfig[]
      }
      // If the config is just an object with tab properties, return empty for now
      return []
    } catch (error) {
      console.error('Failed to load config from file:', error)
      // Fallback to localStorage if Tauri command is not available (e.g. in browser)
      try {
        const data = localStorage.getItem('token-speed-test-configs')
        if (!data) return []
        return JSON.parse(data) as TestConfig[]
      } catch {
        return []
      }
    }
  }

  async save(configs: TestConfig[]): Promise<void> {
    try {
      await invoke('cmd_save_config', { config: { configs } })
      return
    } catch (error) {
      console.error('Failed to save config to file:', error)
      // Fallback to localStorage if Tauri command is not available
      localStorage.setItem('token-speed-test-configs', JSON.stringify(configs))
    }
  }
}
