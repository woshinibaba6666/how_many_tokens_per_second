import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { TestConfig, ThreadResult } from '@/domain/entities'
import type { IApiRepository, StreamChunk } from '@/domain/repositories'

interface OpenAIModel {
  id: string
  object: string
  created: number
  owned_by: string
}

interface OpenAIModelsResponse {
  object: string
  data: OpenAIModel[]
}

interface OpenAIErrorResponse {
  error?: {
    message: string
    type?: string
    param?: string | null
    code?: string | null
  }
}

interface ApiFetchResponse {
  ok: boolean
  status: number
  statusText: string
  body: string
}

interface StreamEventPayload {
  stream_id: string
  data: string
  done: boolean
  error: string | null
  raw?: string
}

function extractErrorMessage(
  res: { status: number; statusText: string },
  errBody: OpenAIErrorResponse
): string {
  const code = res.status
  const message = errBody.error?.message || res.statusText || 'Unknown error'
  return `HTTP ${code}: ${message}`
}

export class OpenAIAdapter implements IApiRepository {
  private streamIds = new Map<number, string>()

  abortStream(threadId: number): void {
    const streamId = this.streamIds.get(threadId)
    if (streamId) {
      this.streamIds.delete(threadId)
      invoke('cmd_abort_stream', { stream_id: streamId }).catch((e) => console.warn('Abort stream failed:', e))
    }
  }
  async fetchModels(config: TestConfig): Promise<string[]> {
    const requestPayload = {
      url: `${config.endpoint}/models`,
      options: {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'User-Agent': config.userAgent,
        },
      },
    }

    if (window.__DEBUG_API__) {
      console.group('[debugApi] IPC invoke: cmd_api_fetch')
      console.log('request:', JSON.parse(JSON.stringify(requestPayload)))
      console.groupEnd()
    }

    // Use Tauri IPC command to fetch models (bypasses CORS in renderer)
    const res = await invoke<ApiFetchResponse>('cmd_api_fetch', {
      request: requestPayload,
    })

    if (window.__DEBUG_API__) {
      console.group('[debugApi] IPC response: cmd_api_fetch')
      console.log('response:', JSON.parse(JSON.stringify(res)))
      console.groupEnd()
    }

    if (!res.ok) {
      const errBody = JSON.parse(res.body || '{}') as OpenAIErrorResponse
      throw new Error(extractErrorMessage(res, errBody))
    }

    const data = JSON.parse(res.body) as OpenAIModelsResponse
    return (data.data || []).map((m) => m.id).sort()
  }

  async streamTest(
    config: TestConfig,
    threadId: number,
    onChunk: (chunk: StreamChunk) => void,
    abortSignal: AbortSignal
  ): Promise<ThreadResult> {
    const startTime = performance.now()
    let firstTokenTime = 0
    let totalContent = ''
    let totalThinking = ''
    let completionTokens = 0

    const url = `${config.endpoint}/chat/completions`
    const requestId = `openai-${threadId}-${Date.now()}`

    const self = this
    self.streamIds.set(threadId, requestId)

    return new Promise((resolve, reject) => {
      let buffer = ''
      let unlistenFn: (() => void) | null = null
      let isDone = false
      // Track the stream invoke promise so onAbort can wait for it
      let streamInvokePromise: Promise<unknown> | null = null
      // Wait for first content/thinking chunk before aborting
      let firstContentChunk = false
      let firstChunkResolve: (() => void) | null = null
      const firstChunkPromise = new Promise<void>((r) => { firstChunkResolve = r })
      // Whether abort has been requested (waiting for first chunk)
      let pendingAbort = false

      function cleanup() {
        self.streamIds.delete(threadId)
        abortSignal.removeEventListener('abort', onAbort)
        if (unlistenFn) {
          unlistenFn()
          unlistenFn = null
        }
      }

      function onFirstChunk(): void {
        if (!firstContentChunk) {
          firstContentChunk = true
          firstChunkResolve?.()
        }
      }

      // Abort handler — registered synchronously so abort() can trigger it
      // even before setupListener() completes. Does NOT set isDone or cleanup
      // so the stream listener can keep running and receive the first chunk.
      const onAbort = (): void => {
        if (!isDone && !pendingAbort) {
          pendingAbort = true
          abortSignal.removeEventListener('abort', onAbort)

          const doAbort = (): void => {
            if (isDone) return
            isDone = true
            cleanup()
            invoke('cmd_abort_stream', { stream_id: requestId }).catch(() => {})
            reject(new Error('Request aborted'))
          }

          // Wait for stream to be registered AND first content chunk
          const waitPromise = streamInvokePromise
            ? Promise.all([streamInvokePromise, firstChunkPromise])
            : firstChunkPromise
          waitPromise.then(doAbort, doAbort)
        }
      }

      // If already aborted, don't even set up the stream
      if (abortSignal.aborted) {
        reject(new Error('Request aborted'))
        return
      }

      // Register abort handler synchronously — before any async work
      abortSignal.addEventListener('abort', onAbort, { once: true })

      async function setupListener() {
        // Listen on the unified stream:data event and filter by stream_id
        unlistenFn = await listen<StreamEventPayload>('stream:data', (event) => {
          if (event.payload.stream_id !== requestId) return
          if (isDone) return

          const payload = event.payload

          if (window.__DEBUG_API__) {
            console.group(`[debugApi] stream:data (thread ${threadId})`)
            console.log('payload:', JSON.parse(JSON.stringify(payload)))
            if (payload.raw) {
              console.log('raw:', payload.raw)
            }
            console.groupEnd()
          }

          // Handle error
          if (payload.error) {
            isDone = true
            cleanup()
            if (window.__DEBUG_API__) {
              console.group(`[debugApi] stream error (thread ${threadId})`)
              console.log('error:', payload.error)
              console.groupEnd()
            }
            if (payload.error === 'Aborted') {
              reject(new Error('Request aborted'))
            } else {
              reject(new Error(payload.error))
            }
            return
          }

          // Handle done
          if (payload.done) {
            isDone = true
            cleanup()
            const totalTime = (performance.now() - startTime) / 1000
            const tokens = completionTokens > 0 ? completionTokens : 0

            const result: ThreadResult = {
              id: threadId,
              status: 'success',
              messages: [
                { role: 'user', content: config.prompt },
                {
                  role: 'assistant',
                  content: totalContent,
                  thinking: totalThinking || undefined,
                },
              ],
              tokens,
              time: totalTime,
              tps: tokens / Math.max(totalTime, 0.001),
              firstTokenTime,
            }

            if (window.__DEBUG_API__) {
              console.group(`[debugApi] stream done (thread ${threadId})`)
              console.log('result:', JSON.parse(JSON.stringify(result)))
              console.groupEnd()
            }

            resolve(result)
            return
          }

          // Handle data chunk
          buffer += payload.data + '\n'
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const l of lines) {
            const trimmed = l.trim()
            if (!trimmed || trimmed === '[DONE]') continue

            if (window.__DEBUG_API__) {
              console.log(`[debugApi] stream raw (thread ${threadId}):`, trimmed)
            }

            try {
              const parsed = JSON.parse(trimmed)

              if (window.__DEBUG_API__) {
                console.log(`[debugApi] stream parsed (thread ${threadId}):`, parsed)
              }

              if (parsed.usage) {
                completionTokens = parsed.usage.completion_tokens || 0
                continue
              }

              const choice = parsed.choices?.[0]
              if (!choice) continue

              const delta = choice.delta
              if (!delta) continue

              if (firstTokenTime === 0 && (delta.content || delta.reasoning_content || delta.thinking)) {
                firstTokenTime = (performance.now() - startTime) / 1000
              }

              const content = delta.content || ''
              const thinking = delta.reasoning_content || delta.thinking || ''

              if (content) totalContent += content
              if (thinking) totalThinking += thinking

              if (content || thinking) {
                onFirstChunk()
                if (window.__DEBUG_API__) {
                  console.log(`[debugApi] stream delta (thread ${threadId}):`, { content, thinking })
                }
                onChunk({ content, thinking })
              }
            } catch (e) {
              console.warn('SSE parse error:', e)
            }
          }
        })

        const streamRequest = {
          stream_id: requestId,
          url,
          api_key: config.apiKey,
          model: config.model,
          messages: [{ role: 'user', content: config.prompt }],
          user_agent: config.userAgent,
          debug: window.__DEBUG_API__,
        }

        if (window.__DEBUG_API__) {
          console.group(`[debugApi] IPC invoke: cmd_stream_test (thread ${threadId})`)
          console.log('request:', JSON.parse(JSON.stringify(streamRequest)))
          console.groupEnd()
        }

        // Start the stream after listener is set up
        streamInvokePromise = invoke('cmd_stream_test', {
          request: streamRequest,
        })
        streamInvokePromise.catch((err) => {
          if (!isDone) {
            isDone = true
            cleanup()
            if (window.__DEBUG_API__) {
              console.group(`[debugApi] invoke error (thread ${threadId})`)
              console.log('error:', err)
              console.groupEnd()
            }
            reject(err)
          }
        })
      }

      setupListener().catch((err) => {
        if (!isDone) {
          isDone = true
          cleanup()
          if (window.__DEBUG_API__) {
            console.group(`[debugApi] setup error (thread ${threadId})`)
            console.log('error:', err)
            console.groupEnd()
          }
          reject(err)
        }
      })
    })
  }
}
