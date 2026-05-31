export class PromptService {
  async loadPrompts(locale: string): Promise<string[]> {
    const fileName = locale === 'zh-CN' ? 'prompt_zh.txt' : 'prompt_en.txt'
    try {
      const response = await fetch(fileName)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const text = await response.text()

      const trimmed = text.trim()
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        throw new Error('Received HTML instead of prompt text')
      }

      const prompts = trimmed
        .split(/\r?\n\r?\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

      return prompts
    } catch (error) {
      console.warn('Failed to load prompts:', error)
      return []
    }
  }
}
