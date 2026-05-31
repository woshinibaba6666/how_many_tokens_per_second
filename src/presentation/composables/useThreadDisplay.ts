import type { ThreadResult, SummaryResult } from '@domain/entities'

export function useThreadDisplay() {
  function summaryValue(result: SummaryResult | null, key: keyof SummaryResult, unit?: string): string {
    if (!result) return '-'
    const value = result[key]
    if (value === undefined || value === null) return '-'
    if (key === 'successRate') {
      return (value as number * 100).toFixed(0) + '%'
    }
    if (typeof value === 'number') {
      return value.toFixed(key === 'totalTokens' ? 0 : 2) + (unit ? ' ' + unit : '')
    }
    return String(value)
  }

  function getRatingClass(label: string | undefined): string {
    if (!label) return ''
    const map: Record<string, string> = {
      'hang': 'rating-hang',
      'top': 'rating-top',
      'good': 'rating-good',
      'npc': 'rating-npc',
      'bad': 'rating-bad',
    }
    return map[label] || 'rating-bad'
  }

  function getAssistantMessage(thread: ThreadResult) {
    return thread.messages.find((m) => m.role === 'assistant')
  }

  function hasThinking(thread: ThreadResult): boolean {
    const msg = getAssistantMessage(thread)
    return !!msg?.thinking && msg.thinking.length > 0
  }

  function getThinking(thread: ThreadResult): string {
    return getAssistantMessage(thread)?.thinking || ''
  }

  function hasContent(thread: ThreadResult): boolean {
    const msg = getAssistantMessage(thread)
    return !!msg?.content && msg.content.length > 0
  }

  function getContent(thread: ThreadResult): string {
    return getAssistantMessage(thread)?.content || ''
  }

  return { summaryValue, getRatingClass, hasThinking, getThinking, hasContent, getContent }
}
