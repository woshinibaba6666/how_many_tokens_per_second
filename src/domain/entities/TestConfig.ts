export interface TestConfig {
  id: string
  name: string
  apiType: 'openai'
  endpoint: string
  apiKey: string
  model: string
  userAgent: string
  concurrency: number
  prompt: string
  modelList: string[]
}

export interface WindowConfig {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface AppConfig {
  configs: TestConfig[]
  activeTabId?: string
  locale?: string
  windowState?: WindowConfig
}

export const DEFAULT_USER_AGENT = 'claude-cli/2.1.154 (external, sdk-cli)'

export const DEFAULT_CONFIG: Omit<TestConfig, 'id' | 'name'> = {
  apiType: 'openai',
  endpoint: '',
  apiKey: '',
  model: '',
  userAgent: DEFAULT_USER_AGENT,
  concurrency: 1,
  prompt: '',
  modelList: [],
}
