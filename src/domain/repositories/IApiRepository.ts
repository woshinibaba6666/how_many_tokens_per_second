import type { TestConfig, ThreadResult } from '@domain/entities'

export interface StreamChunk {
  content: string
  thinking?: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export interface IApiRepository {
  fetchModels(config: TestConfig): Promise<string[]>
  streamTest(config: TestConfig, threadId: number, onChunk: (chunk: StreamChunk) => void, abortSignal: AbortSignal): Promise<ThreadResult>
  abortStream(threadId: number): void
}
