import type { TestConfig, TestResult } from '@/domain/entities'

export type EngineState = 'idle' | 'starting' | 'running' | 'stopping' | 'done'

export interface ITestEngine {
  start(config: TestConfig): Promise<void>
  abort(): Promise<void>
  onProgress(callback: (result: TestResult) => void): void
  onComplete(callback: (result: TestResult) => void): void
  onStateChange(callback: (state: EngineState) => void): void
}
