import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TestConfig, ThreadResult, SummaryResult } from '@domain/entities'
import { DEFAULT_CONFIG } from '@domain/entities'
import { i18n } from '@presentation/i18n'

export type TabStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'done'

export interface Tab {
  id: string
  name: string
  config: Omit<TestConfig, 'id' | 'name'>
  status: TabStatus
  threads: ThreadResult[]
  result: SummaryResult | null
  editingTitle?: boolean
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getNextTabNumber(tabs: Tab[]): number {
  // Build regex dynamically from current locale's default title pattern
  // e.g. "测试 {n}" -> /^测试 (\d+)$/, "Test {n}" -> /^Test (\d+)$/
  const defaultTitleTemplate = i18n.global.t('tabs.defaultTitle', { n: '{n}' })
  const patternString = '^' + defaultTitleTemplate.replace('{n}', '(\\d+)') + '$'
  const defaultTitlePattern = new RegExp(patternString)

  let maxNum = 0
  for (const tab of tabs) {
    const match = tab.name.match(defaultTitlePattern)
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10))
    }
  }
  return maxNum + 1
}

function createDefaultTabName(tabs: Tab[]): string {
  return i18n.global.t('tabs.defaultTitle', { n: getNextTabNumber(tabs) })
}

export const useTabsStore = defineStore('tabs', () => {
  // State
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)

  // Getters
  const activeTab = computed(() => {
    if (!activeTabId.value) return null
    return tabs.value.find((t) => t.id === activeTabId.value) || null
  })

  // Actions
  function addTab(): Tab {
    const id = generateTabId()
    const tab: Tab = {
      id,
      name: createDefaultTabName(tabs.value),
      config: { ...DEFAULT_CONFIG },
      status: 'idle',
      threads: [],
      result: null,
    }
    tabs.value.push(tab)
    activeTabId.value = id
    return tab
  }

  function removeTab(id: string): void {
    const idx = tabs.value.findIndex((t) => t.id === id)
    if (idx < 0) return

    const wasActive = tabs.value[idx].id === activeTabId.value
    tabs.value.splice(idx, 1)

    if (tabs.value.length === 0) {
      const nt = addTab()
      activeTabId.value = nt.id
    } else if (wasActive) {
      activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id
    }
  }

  function setActiveTab(id: string): void {
    if (tabs.value.some((t) => t.id === id)) {
      activeTabId.value = id
    }
  }

  function updateTabName(id: string, name: string): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.name = name.trim() || tab.name
      tab.editingTitle = false
    }
  }

  function setTabEditing(id: string, editing: boolean): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.editingTitle = editing
    }
  }

  function updateTabConfig(
    id: string,
    config: Partial<Omit<TestConfig, 'id' | 'name'>>
  ): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.config = { ...tab.config, ...config }
    }
  }

  function setTabStatus(id: string, status: TabStatus): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.status = status
    }
  }

  function setTabThreads(id: string, threads: ThreadResult[]): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.threads = threads
    }
  }

  function setTabResult(id: string, result: SummaryResult | null): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.result = result
    }
  }

  function clearTabResults(id: string): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) {
      tab.threads = []
      tab.result = null
      tab.status = 'idle'
    }
  }

  function reorderTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    const tab = tabs.value.splice(fromIndex, 1)[0]
    if (tab) {
      tabs.value.splice(toIndex, 0, tab)
    }
  }

  // Initialize with one tab if empty
  function ensureTab(): void {
    if (tabs.value.length === 0) {
      addTab()
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    removeTab,
    setActiveTab,
    updateTabName,
    setTabEditing,
    updateTabConfig,
    setTabStatus,
    setTabThreads,
    setTabResult,
    clearTabResults,
    reorderTab,
    ensureTab,
  }
})
