export type ThreadStatus = 'idle' | 'running' | 'success' | 'error'

export interface ThreadMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
}

export interface ThreadResult {
  id: number
  status: ThreadStatus
  messages: ThreadMessage[]
  tokens: number
  time: number
  tps: number
  firstTokenTime: number
  error?: string
}

export type RatingLabel = 'hang' | 'top' | 'good' | 'npc' | 'bad'

export interface SummaryResult {
  totalTime: number
  totalTokens: number
  avgTps: number
  peakTps: number
  avgFirstTokenTime: number
  successRate: number
  label: RatingLabel
}

export interface TestResult {
  threads: ThreadResult[]
  summary: SummaryResult | null
}

export function calculateRating(avgTps: number, successRate: number, firstTokenTime: number): RatingLabel {
  if (successRate < 0.7) return 'bad'
  if (firstTokenTime > 20) return 'bad'
  if (avgTps >= 78) return 'hang'
  if (avgTps >= 38) return 'top'
  if (avgTps >= 28) return 'good'
  if (avgTps >= 15) return 'npc'
  return 'bad'
}
