import { getEncoding } from 'js-tiktoken'
import type { TestConfig, TestResult, ThreadResult, ThreadStatus } from '@domain/entities'
import { calculateRating } from '@domain/entities'
import type { ITestEngine, EngineState } from '@domain/usecases'
import type { IApiRepository, StreamChunk } from '@domain/repositories'

const enc = getEncoding('cl100k_base')

function countTokens(text: string): number {
  if (!text) return 0
  return enc.encode(text).length
}

interface ThreadState {
  id: number
  status: ThreadStatus
  messages: ThreadResult['messages']
  tokens: number
  time: number
  firstTokenTime: number
  error?: string
  currentContentLength: number
  currentThinkingLength: number
  currentTime: number
  tokenContentOffset: number
  tokenThinkingOffset: number
}

const ABORT_TIMEOUT_MS = 30000

export class TestEngine implements ITestEngine {
  private config: TestConfig | null = null
  private abortController: AbortController | null = null
  private threads: ThreadState[] = []
  private threadPromises: Promise<void>[] = []
  private progressCallback: ((result: TestResult) => void) | null = null
  private completeCallback: ((result: TestResult) => void) | null = null
  private stateChangeCallback: ((state: EngineState) => void) | null = null
  private completedCount = 0
  private state: EngineState = 'idle'
  private userAborted = false
  private progressThrottleTimer: ReturnType<typeof setTimeout> | null = null
  private pendingProgress = false
  private progressThrottleMs = 33

  constructor(private adapter: IApiRepository) {}

  onProgress(callback: (result: TestResult) => void): void {
    this.progressCallback = callback
  }

  onComplete(callback: (result: TestResult) => void): void {
    this.completeCallback = callback
  }

  onStateChange(callback: (state: EngineState) => void): void {
    this.stateChangeCallback = callback
  }

  private setState(state: EngineState): void {
    this.state = state
    this.stateChangeCallback?.(state)
  }

  async start(config: TestConfig): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'done') {
      throw new Error('Test is already running')
    }

    this.setState('starting')
    this.config = config
    this.userAborted = false
    this.abortController = new AbortController()
    this.completedCount = 0
    this.threadPromises = []

    const concurrency = Math.max(1, Math.min(100, config.concurrency))

    if (concurrency <= 10) {
      this.progressThrottleMs = 33
    } else if (concurrency <= 20) {
      this.progressThrottleMs = 43
    } else if (concurrency <= 30) {
      this.progressThrottleMs = 59
    } else {
      this.progressThrottleMs = 100
    }

    this.threads = Array.from({ length: concurrency }, (_, i) => ({
      id: i,
      status: 'running' as ThreadStatus,
      messages: [{ role: 'user' as const, content: config.prompt }],
      tokens: 0,
      time: 0,
      firstTokenTime: 0,
      currentContentLength: 0,
      currentThinkingLength: 0,
      currentTime: 0,
      tokenContentOffset: 0,
      tokenThinkingOffset: 0,
    }))

    // 用户在 starting 阶段已请求 abort
    if (this.userAborted) {
      this.forceSettleAllThreads()
      this.setState('done')
      this.emitComplete()
      return
    }

    this.setState('running')
    this.emitProgress()

    this.threadPromises = this.threads.map((thread) => this.runThread(thread))

    await Promise.allSettled(this.threadPromises)

    this.setState('done')
    this.clearProgressThrottle()
    this.emitComplete()
  }

  async abort(): Promise<void> {
    if (this.state === 'idle' || this.state === 'done' || this.state === 'stopping') {
      return
    }

    this.userAborted = true
    this.setState('stopping')

    // 发送 abort 信号 — streamTest() 内部会监听此信号并调用 cmd_abort_stream
    this.abortController?.abort()

    // 如果线程还没创建（starting 阶段），直接结算
    if (this.threadPromises.length === 0) {
      this.forceSettleAllThreads()
      this.clearProgressThrottle()
      this.emitComplete()
      return
    }

    // 等待所有线程结束，每个线程 30s 超时强制结算
    await Promise.allSettled(
      this.threadPromises.map((promise, i) =>
        Promise.race([
          promise,
          new Promise<void>((resolve) => {
            setTimeout(() => {
              const thread = this.threads[i]
              if (thread && thread.status === 'running') {
                thread.status = 'error'
                thread.error = 'Abort timeout'
                thread.time = ABORT_TIMEOUT_MS / 1000
                this.completedCount++
                this.emitProgress()
              }
              resolve()
            }, ABORT_TIMEOUT_MS)
          }),
        ]),
      ),
    )

    this.clearProgressThrottle()
    this.emitComplete()
  }

  private forceSettleAllThreads(): void {
    for (const thread of this.threads) {
      if (thread.status === 'running') {
        thread.status = 'error'
        thread.error = 'Aborted before start'
      }
    }
  }

  private clearProgressThrottle(): void {
    if (this.progressThrottleTimer) {
      clearTimeout(this.progressThrottleTimer)
      this.progressThrottleTimer = null
    }
    this.pendingProgress = false
  }

  private async runThread(thread: ThreadState): Promise<void> {
    if (!this.config || !this.adapter || !this.abortController) return

    const startTime = performance.now()

    try {
      const onChunk = (chunk: StreamChunk): void => {
        thread.currentTime = (performance.now() - startTime) / 1000

        if (chunk.content) {
          thread.currentContentLength += chunk.content.length
        }
        if (chunk.thinking) {
          thread.currentThinkingLength += chunk.thinking.length
        }

        const assistantMessage = thread.messages.find((m) => m.role === 'assistant')
        if (assistantMessage) {
          if (chunk.content) assistantMessage.content += chunk.content
          if (chunk.thinking) {
            assistantMessage.thinking = (assistantMessage.thinking || '') + chunk.thinking
          }
        } else if (chunk.content || chunk.thinking) {
          thread.messages.push({
            role: 'assistant',
            content: chunk.content || '',
            thinking: chunk.thinking || undefined,
          })
        }

        this.emitProgress()
      }

      const result = await this.adapter.streamTest(
        this.config,
        thread.id,
        onChunk,
        this.abortController.signal,
      )

      thread.status = 'success'
      thread.tokens = result.tokens
      thread.time = result.time
      thread.firstTokenTime = result.firstTokenTime
      thread.messages = result.messages
    } catch (error) {
      thread.status = 'error'
      thread.error = error instanceof Error ? error.message : String(error)
      thread.time = (performance.now() - startTime) / 1000
      // 不中止其他线程，不 re-throw
    }

    this.completedCount++
    this.emitProgress()
  }

  private emitProgress(): void {
    if (!this.progressCallback) return

    if (this.progressThrottleTimer) {
      this.pendingProgress = true
      return
    }

    this.progressCallback(this.buildResult())

    this.progressThrottleTimer = setTimeout(() => {
      this.progressThrottleTimer = null
      if (this.pendingProgress) {
        this.pendingProgress = false
        this.emitProgress()
      }
    }, this.progressThrottleMs)
  }

  private emitComplete(): void {
    if (!this.completeCallback) return
    this.completeCallback(this.buildResult())
  }

  private buildResult(): TestResult {
    const threadResults: ThreadResult[] = this.threads.map((t) => {
      const assistantMsg = t.messages.find((m) => m.role === 'assistant')
      const content = assistantMsg?.content || ''
      const thinking = assistantMsg?.thinking || ''

      let accurateTokens: number
      if (t.status === 'success' && t.tokens > 0) {
        // Use API-reported token count for completed threads
        accurateTokens = t.tokens
      } else {
        // Incremental counting for running/error threads
        const newContent = content.slice(t.tokenContentOffset)
        const newThinking = thinking.slice(t.tokenThinkingOffset)
        t.tokens += countTokens(newContent) + countTokens(newThinking)
        t.tokenContentOffset = content.length
        t.tokenThinkingOffset = thinking.length
        accurateTokens = t.tokens
      }

      const time = t.time || t.currentTime
      const tps = t.status === 'success' && time > 0 ? accurateTokens / time : 0

      return {
        id: t.id,
        status: t.status,
        messages: t.messages,
        tokens: accurateTokens,
        time,
        tps,
        firstTokenTime: t.firstTokenTime,
        error: t.error,
      }
    })

    const allCompleted = this.threads.every((t) => t.status === 'success' || t.status === 'error')
    const allDone = this.completedCount >= this.threads.length

    let summary = null
    if (allDone && allCompleted) {
      const successThreads = threadResults.filter((t) => t.status === 'success')
      const totalTime = Math.max(...threadResults.map((t) => t.time || 0))
      const totalTokens = successThreads.reduce((sum, t) => sum + t.tokens, 0)
      const avgTps =
        successThreads.length > 0
          ? successThreads.reduce((sum, t) => sum + t.tps, 0) / successThreads.length
          : 0
      const peakTps =
        successThreads.length > 0 ? Math.max(...successThreads.map((t) => t.tps)) : 0
      const avgFirstTokenTime =
        successThreads.length > 0
          ? successThreads.reduce((sum, t) => sum + t.firstTokenTime, 0) / successThreads.length
          : 0
      const successRate =
        this.threads.length > 0 ? successThreads.length / this.threads.length : 0

      summary = {
        totalTime,
        totalTokens,
        avgTps,
        peakTps,
        avgFirstTokenTime,
        successRate,
        label: calculateRating(avgTps, successRate, avgFirstTokenTime),
      }
    }

    return { threads: threadResults, summary }
  }
}
