<template>
  <div class="app-container" @contextmenu.prevent="onContextMenu">
    <!-- Title Bar with Tabs -->
    <TitleBar
      :tabs="tabs"
      :active-tab-id="activeTabId"
      @add-tab="addTab"
      @remove-tab="removeTab"
      @set-active-tab="setActiveTab"
      @update-tab-name="updateTabName"
      @set-tab-editing="setTabEditing"
      @reorder-tab="onReorderTab"
    />

    <!-- Main Content -->
    <div class="main-content">
      <ConfigPanel
        :tab="activeTab"
        :api-repository="apiRepository"
        @update:config="onConfigUpdate"
        @start-test="onStartTest"
        @abort-test="onAbortTest"
      />
      <ResultPanel
        :threads="activeTab?.threads || []"
        :result="activeTab?.result || null"
        :status="activeTab?.status || 'idle'"
        @clear="onClearResults"
      />
    </div>

    <!-- Custom context menu for inputs -->
    <div
      v-if="ctxVisible"
      class="ctx-menu"
      :style="{ left: ctxX + 'px', top: ctxY + 'px' }"
      @click.stop
    >
      <button class="ctx-menu-item" :disabled="!ctxHasSelection" @click="ctxCut">{{ t('contextMenu.cut') }}</button>
      <button class="ctx-menu-item" :disabled="!ctxHasSelection" @click="ctxCopy">{{ t('contextMenu.copy') }}</button>
      <button class="ctx-menu-item" @click="ctxPaste">{{ t('contextMenu.paste') }}</button>
      <button class="ctx-menu-item" :disabled="!ctxHasValue" @click="ctxSelectAll">{{ t('contextMenu.selectAll') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TitleBar from '@/presentation/components/TitleBar.vue'
import ConfigPanel from '@/presentation/views/ConfigPanel.vue'
import ResultPanel from '@/presentation/views/ResultPanel.vue'
import { useTabsStore } from '@/presentation/stores/tabs'
import { TestEngine } from '@/infrastructure/services'
import { configStorage, apiRepository } from '@/di'
import type { TestConfig, TestResult } from '@/domain/entities'
import type { Tab } from '@/presentation/stores/tabs'
import { showErrorDialog } from '@/presentation/utils/error'
import { ElMessageBox } from 'element-plus'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { storeToRefs } from 'pinia'

const { t, locale } = useI18n()
const tabsStore = useTabsStore()
const { tabs, activeTabId, activeTab } = storeToRefs(tabsStore)
const engines = ref<Map<string, TestEngine>>(new Map())

// Context menu
const ctxVisible = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxHasSelection = ref(false)
const ctxHasValue = ref(false)
let ctxTarget: HTMLInputElement | HTMLTextAreaElement | null = null

function onContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  const input = target.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
  if (!input) {
    ctxVisible.value = false
    return
  }
  ctxTarget = input
  ctxHasSelection.value = input.selectionStart !== input.selectionEnd
  ctxHasValue.value = input.value.length > 0
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxVisible.value = true
}

function hideCtxMenu() {
  ctxVisible.value = false
  ctxTarget = null
}

async function ctxCut() {
  if (!ctxTarget) return
  const selected = ctxTarget.value.slice(ctxTarget.selectionStart ?? 0, ctxTarget.selectionEnd ?? 0)
  if (selected) await writeText(selected)
  ctxTarget.value = ctxTarget.value.slice(0, ctxTarget.selectionStart ?? 0) + ctxTarget.value.slice(ctxTarget.selectionEnd ?? 0)
  ctxTarget.selectionStart = ctxTarget.selectionEnd = ctxTarget.selectionStart ?? 0
  ctxTarget.dispatchEvent(new Event('input', { bubbles: true }))
  hideCtxMenu()
}

async function ctxCopy() {
  if (!ctxTarget) return
  const selected = ctxTarget.value.slice(ctxTarget.selectionStart ?? 0, ctxTarget.selectionEnd ?? 0)
  if (selected) await writeText(selected)
  hideCtxMenu()
}

async function ctxPaste() {
  if (!ctxTarget) return
  try {
    const text = await readText()
    const start = ctxTarget.selectionStart ?? 0
    const end = ctxTarget.selectionEnd ?? 0
    ctxTarget.value = ctxTarget.value.slice(0, start) + text + ctxTarget.value.slice(end)
    ctxTarget.selectionStart = ctxTarget.selectionEnd = start + text.length
    ctxTarget.dispatchEvent(new Event('input', { bubbles: true }))
  } catch (e) { console.warn('Clipboard paste failed:', e) }
  ctxTarget.focus()
  hideCtxMenu()
}

function ctxSelectAll() {
  ctxTarget?.focus()
  ctxTarget?.select()
  hideCtxMenu()
}

// Close context menu on any click outside
function onGlobalClick() {
  if (ctxVisible.value) hideCtxMenu()
}

// Update document title based on current locale
function updateTitle() {
  document.title = t('app.title')
}

// Watch locale changes to update title
watch(locale, () => {
  updateTitle()
})

// Load config on mount
onMounted(async () => {
  window.addEventListener('click', onGlobalClick)
  // Set initial title
  updateTitle()

  try {
    const configs = await configStorage.load()
    if (configs.length > 0) {
      // Restore tabs from saved configs
      tabsStore.tabs = configs.map((cfg) => ({
        id: cfg.id,
        name: cfg.name,
        config: {
          apiType: cfg.apiType,
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          model: cfg.model,
          userAgent: cfg.userAgent,
          concurrency: cfg.concurrency,
          prompt: cfg.prompt,
          modelList: cfg.modelList || [],
        },
        status: 'idle' as const,
        threads: [],
        result: null,
      }))
      tabsStore.activeTabId = configs[0].id
    } else {
      tabsStore.ensureTab()
    }
  } catch (e) {
    console.warn('Failed to load config:', e)
    tabsStore.ensureTab()
  }
})

// Auto-save config when tabs change (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => tabsStore.tabs,
  (newTabs) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        const configs: TestConfig[] = newTabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          apiType: tab.config.apiType,
          endpoint: tab.config.endpoint,
          apiKey: tab.config.apiKey,
          model: tab.config.model,
          userAgent: tab.config.userAgent,
          concurrency: tab.config.concurrency,
          prompt: tab.config.prompt,
          modelList: tab.config.modelList || [],
        }))
        await configStorage.save(configs)
      } catch (error) {
        console.error('Failed to save config:', error)
      }
    }, 500)
  },
  { deep: true }
)

function mapThreads(threads: TestResult['threads']) {
  return threads.map((t) => ({
    id: t.id,
    status: t.status,
    messages: t.messages,
    tokens: t.tokens,
    time: t.time,
    tps: t.tps,
    firstTokenTime: t.firstTokenTime,
    error: t.error,
  }))
}

function onConfigUpdate(config: Partial<Tab['config']>) {
  if (activeTab.value) {
    tabsStore.updateTabConfig(activeTab.value.id, config)
  }
}

async function onStartTest() {
  if (!activeTab.value) return
  const tab = activeTab.value
  if (engines.value.has(tab.id)) return

  const config: TestConfig = {
    id: tab.id,
    name: tab.name,
    apiType: tab.config.apiType,
    endpoint: tab.config.endpoint,
    apiKey: tab.config.apiKey,
    model: tab.config.model,
    userAgent: tab.config.userAgent,
    concurrency: tab.config.concurrency,
    prompt: tab.config.prompt,
    modelList: tab.config.modelList || [],
  }

  // Clear previous results
  tabsStore.clearTabResults(tab.id)

  // Create and start test engine
  const engine = new TestEngine(apiRepository)
  engines.value.set(tab.id, engine)

  // 状态变化由状态机驱动
  engine.onStateChange((state) => {
    tabsStore.setTabStatus(tab.id, state)
  })

  engine.onProgress((result) => {
    tabsStore.setTabThreads(tab.id, mapThreads(result.threads))
  })

  engine.onComplete((result) => {
    tabsStore.setTabThreads(tab.id, mapThreads(result.threads))
    if (result.summary) {
      tabsStore.setTabResult(tab.id, result.summary)
    }
    engines.value.delete(tab.id)
  })

  try {
    await engine.start(config)
  } catch (error) {
    showErrorDialog(
      error,
      t('error.testFailed'),
      t('error.close'),
      (code, msg) => `${t('error.statusCode', { code })}\n${t('error.message', { msg })}`
    )
    tabsStore.setTabStatus(tab.id, 'idle')
    engines.value.delete(tab.id)
  }
}

async function onAbortTest() {
  if (!activeTab.value) return
  const engine = engines.value.get(activeTab.value.id)
  if (engine) {
    await engine.abort()
  }
}

function onClearResults() {
  if (activeTab.value) {
    tabsStore.clearTabResults(activeTab.value.id)
  }
}

// Tab actions
function addTab() {
  tabsStore.addTab()
}

async function removeTab(id: string) {
  const tab = tabs.value.find(t => t.id === id)
  if (tab && (tab.config.endpoint || tab.config.apiKey)) {
    try {
      await ElMessageBox.confirm(
        t('tabs.confirmCloseMessage'),
        t('tabs.confirmCloseTitle'),
        { confirmButtonText: t('tabs.confirm'), cancelButtonText: t('tabs.cancel'), type: 'warning', customClass: 'confirm-close-dialog' }
      )
    } catch {
      return
    }
  }
  tabsStore.removeTab(id)
}

function setActiveTab(id: string) {
  tabsStore.setActiveTab(id)
}

function onReorderTab(fromIndex: number, toIndex: number) {
  tabsStore.reorderTab(fromIndex, toIndex)
}

function updateTabName(id: string, name: string) {
  tabsStore.updateTabName(id, name)
}

function setTabEditing(id: string, editing: boolean) {
  tabsStore.setTabEditing(id, editing)
}
</script>

<style scoped lang="scss">
.app-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: calc(100vh - var(--title-bar-height));
}

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 100px;
}

.ctx-menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  font: 12px var(--font-body);
  text-align: left;
  cursor: default;
  transition: background var(--transition-normal);

  &:hover:not(:disabled) {
    background: var(--accent-glow);
  }

  &:disabled {
    opacity: 0.2;
    cursor: default;
  }
}
</style>

<style lang="scss">
.confirm-close-dialog {
  .el-message-box__btns .el-button--primary {
    --el-button-bg-color: var(--danger);
    --el-button-border-color: var(--danger);
    --el-button-hover-bg-color: var(--danger-hover-bg);
    --el-button-hover-border-color: var(--danger-hover-bg);
  }
}
</style>
