<template>
  <div
    class="title-bar"
    :class="{ 'is-tab-dragging': pendingDragIdx !== null || dragIndex !== null, 'is-mac': isMac, 'is-mac-traffic': isMac && !showMacIcon, 'no-transition': noTransition }"
    @mousedown="onTitleBarMouseDown"
  >
    <!-- App icon (hidden on macOS when not fullscreen, shown to fill traffic lights area) -->
    <div
      class="title-bar-icon"
      :class="{ 'icon-visible': isMac && showMacIcon }"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    </div>

    <!-- Tabs area -->
    <div
      ref="tabBarRef"
      class="tab-bar"
    >
      <div
        v-for="(tab, idx) in tabs"
        :key="tab.id"
        class="tab"
        :class="{
          active: tab.id === activeTabId,
          'tab-dragging': dragIndex === idx,
          'tab-drag-over': dragOverIndex === idx && dragIndex !== idx,
        }"
        :style="getTabStyle(idx)"
        @click="onTabClick(tab.id)"
        @mousedown="onTabMouseDown($event, idx)"
        @contextmenu.prevent="onTabContextMenu($event, tab.id)"
      >
        <template v-if="tab.editingTitle && tab.id === activeTabId">
          <input
            ref="titleInputRef"
            v-model="editingName"
            class="tab-title-input"
            @blur="saveTabName(tab.id)"
            @keydown="onTitleKeydown($event, tab.id)"
          />
        </template>
        <template v-else>
          <span
            class="tab-title"
            @dblclick.stop="startEditing(tab)"
          >{{ tab.name }}</span>
        </template>
        <button
          class="tab-close"
          :title="t('tabs.close')"
          @click.stop="onCloseTab(tab.id)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="0" y1="0" x2="10" y2="10"/>
            <line x1="10" y1="0" x2="0" y2="10"/>
          </svg>
        </button>
      </div>

      <!-- Add tab button -->
      <button
        class="tab-add"
        :title="t('tabs.newTest')"
        @click="onAddTab"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Window controls -->
    <div class="window-controls" :class="{ 'mac-controls': isMac }">
      <button
        class="lang-switch"
        :title="locale === 'zh-CN' ? 'Switch to English' : '切换到中文'"
        @click="toggleLanguage"
      >
        {{ t('app.langSwitch') }}
      </button>
      <!-- Custom window controls (Windows only) -->
      <template v-if="!isMac">
        <button
          class="btn-minimize"
          :title="t('window.minimize')"
          @click="minimizeWindow"
        >
          <svg viewBox="0 0 16 16" width="10" height="10">
            <path d="M3 7.5C3 7.22386 3.22386 7 3.5 7H12.5C12.7761 7 13 7.22386 13 7.5C13 7.77614 12.7761 8 12.5 8H3.5C3.22386 8 3 7.77614 3 7.5Z"/>
          </svg>
        </button>
        <button
          class="btn-maximize"
          :title="isMaximized ? t('window.restore') : t('window.maximize')"
          @click="maximizeWindow"
        >
          <svg v-if="isMaximized" viewBox="0 0 16 16" style="width: 16px; height: 16px;">
            <path d="M5.08496 4C5.29088 3.4174 5.8465 3 6.49961 3H9.99961C11.6565 3 12.9996 4.34315 12.9996 6V9.5C12.9996 10.1531 12.5822 10.7087 11.9996 10.9146V6C11.9996 4.89543 11.1042 4 9.99961 4H5.08496ZM4.5 5H9.5C10.3284 5 11 5.67157 11 6.5V11.5C11 12.3284 10.3284 13 9.5 13H4.5C3.67157 13 3 12.3284 3 11.5V6.5C3 5.67157 3.67157 5 4.5 5ZM4.5 6C4.22386 6 4 6.22386 4 6.5V11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5V6.5C10 6.22386 9.77614 6 9.5 6H4.5Z"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" style="width: 12px; height: 12px;">
            <path d="M2 4.5C2 3.11929 3.11929 2 4.5 2H11.5C12.8807 2 14 3.11929 14 4.5V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V4.5ZM4.5 3C3.67157 3 3 3.67157 3 4.5V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V4.5C13 3.67157 12.3284 3 11.5 3H4.5Z"/>
          </svg>
        </button>
        <button
          class="btn-close"
          :title="t('window.close')"
          @click="closeWindow"
        >
          <svg viewBox="0 0 16 16" width="10" height="10">
            <path d="M2.58859 2.71569L2.64645 2.64645C2.82001 2.47288 3.08944 2.4536 3.28431 2.58859L3.35355 2.64645L8 7.293L12.6464 2.64645C12.8417 2.45118 13.1583 2.45118 13.3536 2.64645C13.5488 2.84171 13.5488 3.15829 13.3536 3.35355L8.707 8L13.3536 12.6464C13.5271 12.82 13.5464 13.0894 13.4114 13.2843L13.3536 13.3536C13.18 13.5271 12.9106 13.5464 12.7157 13.4114L12.6464 13.3536L8 8.707L3.35355 13.3536C3.15829 13.5488 2.84171 13.5488 2.64645 13.3536C2.45118 13.1583 2.45118 12.8417 2.64645 12.6464L7.293 8L2.64645 3.35355C2.47288 3.17999 2.4536 2.91056 2.58859 2.71569L2.64645 2.64645L2.58859 2.71569Z"/>
          </svg>
        </button>
      </template>
    </div>

    <!-- Tab context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="tab-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="tab-context-menu-item" @click="onContextMenuRename">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
          {{ t('tabs.rename') }}
        </div>
        <div class="tab-context-menu-item danger" @click="onContextMenuClose">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          {{ t('tabs.close') }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { TauriWindowService } from '@infrastructure/services/TauriWindowService'
import type { IWindowService } from '@domain/services/IWindowService'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { toggleLocale } from '@presentation/i18n'
import { usePlatform } from '@presentation/composables/usePlatform'
import type { Tab } from '@presentation/stores/tabs'

interface Props {
  tabs: Tab[]
  activeTabId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'addTab'): void
  (e: 'removeTab', id: string): void
  (e: 'setActiveTab', id: string): void
  (e: 'updateTabName', id: string, name: string): void
  (e: 'setTabEditing', id: string, editing: boolean): void
  (e: 'reorderTab', fromIndex: number, toIndex: number): void
}>()

const { t, locale } = useI18n()
const { isMac } = usePlatform()
const appWindow = getCurrentWindow()

const isMaximized = ref(false)
const showMacIcon = ref(false)
const noTransition = ref(false)
const editingName = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

// Context menu state
const contextMenuRef = ref<HTMLElement | null>(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, tabId: '' })

// Drag state
const DRAG_THRESHOLD = 4
const tabBarRef = ref<HTMLElement | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dragOffsetX = ref(0)
const dragStartX = ref(0)
const dragTabWidth = ref(0)
const pendingDragIdx = ref<number | null>(null)
const dragBarLeft = ref(0)
const dragBarRight = ref(0)
const dragTabLeft = ref(0)
const dragTabRight = ref(0)

function getTabStyle(idx: number) {
  const from = dragIndex.value
  const to = dragOverIndex.value
  if (from === null) return undefined

  // Dragged tab — follows mouse cursor, no CSS transition
  if (idx === from) {
    return {
      transform: `translateX(${dragOffsetX.value}px)`,
      zIndex: 10,
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      pointerEvents: 'none' as const,
      transition: 'none',
    }
  }

  // Other tabs shift sideways to create a gap for the dragged tab
  if (to !== null && from !== to) {
    const w = dragTabWidth.value + 2
    if (from < to && idx > from && idx <= to) {
      return { transform: `translateX(${-w}px)`, transition: 'transform 0.18s ease' }
    }
    if (from > to && idx >= to && idx < from) {
      return { transform: `translateX(${w}px)`, transition: 'transform 0.18s ease' }
    }
  }

  return { transition: 'transform 0.18s ease' }
}

const windowService: IWindowService = new TauriWindowService()
let cleanupMaximized: (() => void) | null = null
let unlistenMoved: UnlistenFn | null = null
let unlistenWillMaximize: UnlistenFn | null = null
let unlistenDidMaximize: UnlistenFn | null = null

function cleanupDragState() {
  pendingDragIdx.value = null
  dragIndex.value = null
  dragOverIndex.value = null
  dragOffsetX.value = 0
}

// Window drag handling for macOS overlay mode
function onTitleBarMouseDown(e: MouseEvent) {
  // Only handle left mouse button
  if (e.button !== 0) return

  // Don't drag if clicking on interactive elements
  const target = e.target as HTMLElement
  if (target.closest('.tab, .tab-add, .tab-close, .tab-title-input, .lang-switch, button')) {
    return
  }

  // Prevent text selection during drag
  e.preventDefault()

  // Double click to toggle maximize (use IPC to avoid fullscreen on macOS)
  if (e.detail === 2) {
    windowService.maximize()
    return
  }

  // Start window dragging
  appWindow.startDragging()
}

onMounted(async () => {
  cleanupMaximized = windowService.onMaximizedChange((maximized) => {
    isMaximized.value = maximized
  })
  // macOS: react to fullscreen BEFORE system animation starts
  unlistenWillMaximize = await listen<boolean>('window-will-maximize-change', (event) => {
    if (!event.payload) {
      // Exiting fullscreen: no animation, snap back immediately
      noTransition.value = true
      showMacIcon.value = false
      isMaximized.value = false
      requestAnimationFrame(() => { noTransition.value = false })
    } else {
      // Entering fullscreen: with animation
      noTransition.value = false
      isMaximized.value = true
    }
  })
  // Keep the onMoved listener for drag cleanup - this is window-specific
  unlistenMoved = await appWindow.onMoved(() => {
    cleanupDragState()
  })
  document.addEventListener('mousemove', onDocumentMouseMove)
  document.addEventListener('mouseup', onDocumentMouseUp)
  document.addEventListener('mousedown', onDocumentMouseDown)
  // macOS: icon appears AFTER fullscreen animation completes
  unlistenDidMaximize = await listen<boolean>('window-did-maximize-change', (event) => {
    showMacIcon.value = event.payload
  })
})

onUnmounted(() => {
  cleanupMaximized?.()
  unlistenMoved?.()
  unlistenWillMaximize?.()
  unlistenDidMaximize?.()
  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)
  document.removeEventListener('mousedown', onDocumentMouseDown)
})

function onTabMouseDown(e: MouseEvent, idx: number) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('.tab-close, .tab-title-input')) return

  // Prevent text selection during drag
  e.preventDefault()

  pendingDragIdx.value = idx
  dragStartX.value = e.clientX
  dragTabWidth.value = (e.currentTarget as HTMLElement).offsetWidth
}

function onDocumentMouseMove(e: MouseEvent) {
  // Left button released (e.g. window drag swallowed mouseup) — clean up
  if (!(e.buttons & 1)) {
    pendingDragIdx.value = null
    if (dragIndex.value !== null) {
      dragIndex.value = null
      dragOverIndex.value = null
      dragOffsetX.value = 0
    }
    return
  }

  if (pendingDragIdx.value !== null) {
    if (Math.abs(e.clientX - dragStartX.value) < DRAG_THRESHOLD) return
    dragIndex.value = pendingDragIdx.value
    pendingDragIdx.value = null
    dragOffsetX.value = 0
    dragOverIndex.value = null
    e.preventDefault()

    // Capture boundary rects before any transform is applied
    const bar = tabBarRef.value
    if (bar) {
      const barRect = bar.getBoundingClientRect()
      dragBarLeft.value = barRect.left
      dragBarRight.value = barRect.right
      const tabEls = bar.querySelectorAll('.tab')
      const draggedEl = tabEls[dragIndex.value] as HTMLElement
      if (draggedEl) {
        const tabRect = draggedEl.getBoundingClientRect()
        dragTabLeft.value = tabRect.left
        dragTabRight.value = tabRect.right
      }
    }
  }

  if (dragIndex.value === null) return

  const dx = e.clientX - dragStartX.value
  // Clamp so the dragged tab preview stays within the tab bar bounds
  const minDx = dragBarLeft.value - dragTabLeft.value
  const maxDx = dragBarRight.value - dragTabRight.value
  const clampedDx = Math.max(minDx, Math.min(maxDx, dx))
  dragOffsetX.value = clampedDx

  const bar = tabBarRef.value
  if (!bar) return

  const tabEls = bar.querySelectorAll('.tab')
  const fromIdx = dragIndex.value
  const draggedEl = tabEls[fromIdx] as HTMLElement
  const draggedLeft = draggedEl.offsetLeft + clampedDx
  const draggedRight = draggedLeft + draggedEl.offsetWidth

  let targetIdx = fromIdx
  for (let i = 0; i < tabEls.length; i++) {
    if (i === fromIdx) continue
    const el = tabEls[i] as HTMLElement
    const center = el.offsetLeft + el.offsetWidth / 2
    // Left edge crosses center of a tab to the left
    if (i < fromIdx && draggedLeft < center) {
      targetIdx = Math.min(targetIdx, i)
    }
    // Right edge crosses center of a tab to the right
    if (i > fromIdx && draggedRight > center) {
      targetIdx = Math.max(targetIdx, i)
    }
  }

  dragOverIndex.value = targetIdx !== fromIdx ? targetIdx : null
}

async function onDocumentMouseUp() {
  pendingDragIdx.value = null

  if (dragIndex.value === null) return

  const bar = tabBarRef.value
  if (!bar) {
    cleanupDragState()
    return
  }

  const fromIdx = dragIndex.value
  const toIdx = dragOverIndex.value
  const allTabs = Array.from(bar.querySelectorAll<HTMLElement>('.tab'))
  const draggedEl = allTabs[fromIdx]

  // ── Snapshot the dragged tab's current screen position while
  //    the drag transform is still alive.
  const oldScreenX = draggedEl.getBoundingClientRect().left

  if (toIdx !== null && fromIdx !== toIdx) {
    // ══════════════════════════════════════════════════════════
    // Case A: tab crossed another tab → reorder + settle
    // ══════════════════════════════════════════════════════════

    // Clear drag state + emit reorder.  Vue will re-render:
    // getTabStyle() → undefined for all tabs → inline styles wiped.
    dragIndex.value = null
    dragOverIndex.value = null
    dragOffsetX.value = 0
    emit('reorderTab', fromIdx, toIdx)

    await nextTick()

    // Freeze all tabs now that Vue has finished its render pass.
    for (const el of allTabs) {
      el.style.transition = 'none'
    }

    // Teleport: shift the dragged tab back to where the user
    // released it so there is zero visual pop.
    const newScreenX = draggedEl.getBoundingClientRect().left
    const delta = oldScreenX - newScreenX

    if (Math.abs(delta) > 0.5) {
      draggedEl.style.transform = `translateX(${delta}px)`
    }

    void bar.offsetHeight // commit the teleported frame

    // Animate: slide from the teleported position into the new slot.
    draggedEl.style.transition = 'transform 0.18s ease'
    draggedEl.style.transform = ''

    await new Promise<void>(resolve => setTimeout(resolve, 220))
  } else {
    // ══════════════════════════════════════════════════════════
    // Case B: tab didn't cross any other tab → bounce back
    // ══════════════════════════════════════════════════════════

    // Capture the drag offset BEFORE clearing state — this is
    // the distance the tab was dragged away from its home slot.
    const bounceOffset = dragOffsetX.value

    // Clear reactive drag state.  Vue wipes inline :style.
    dragIndex.value = null
    dragOverIndex.value = null
    dragOffsetX.value = 0

    await nextTick()

    if (Math.abs(bounceOffset) > 0.5) {
      // Teleport the tab back to where the user released it.
      draggedEl.style.transition = 'none'
      draggedEl.style.transform = `translateX(${bounceOffset}px)`

      void bar.offsetHeight

      // Animate: slide back to the original slot (translateX → 0).
      draggedEl.style.transition = 'transform 0.18s ease'
      draggedEl.style.transform = ''

      await new Promise<void>(resolve => setTimeout(resolve, 220))
    }
  }

  // Always scrub every inline style we touched so the elements
  // return to normal CSS / Vue control.
  const cleanTabs = bar.querySelectorAll<HTMLElement>('.tab')
  for (const el of cleanTabs) {
    el.style.removeProperty('transition')
    el.style.removeProperty('transform')
  }
}

function onTabClick(id: string) {
  emit('setActiveTab', id)
}

function onCloseTab(id: string) {
  emit('removeTab', id)
}

function onAddTab() {
  emit('addTab')
}

async function startEditing(tab: Tab) {
  editingName.value = tab.name
  emit('setTabEditing', tab.id, true)
  await nextTick()
  const input = document.querySelector('.tab-title-input') as HTMLInputElement | null
  input?.focus()
}

function saveTabName(id: string) {
  emit('updateTabName', id, editingName.value)
}

function onTitleKeydown(event: KeyboardEvent, id: string) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveTabName(id)
  } else if (event.key === 'Escape') {
    emit('setTabEditing', id, false)
  }
}

function toggleLanguage() {
  toggleLocale()
}

function minimizeWindow() {
  windowService.minimize().catch(console.error)
}

function maximizeWindow() {
  windowService.maximize().catch(console.error)
}

function closeWindow() {
  windowService.close().catch(console.error)
}

// ── Context menu ──

function onTabContextMenu(e: MouseEvent, tabId: string) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, tabId }
}

function onDocumentMouseDown(e: MouseEvent) {
  if (contextMenu.value.visible && contextMenuRef.value && !contextMenuRef.value.contains(e.target as Node)) {
    contextMenu.value = { ...contextMenu.value, visible: false }
  }
}

function onContextMenuRename() {
  const tab = props.tabs.find(t => t.id === contextMenu.value.tabId)
  if (tab) {
    emit('setActiveTab', tab.id)
    startEditing(tab)
  }
  contextMenu.value = { ...contextMenu.value, visible: false }
}

function onContextMenuClose() {
  emit('removeTab', contextMenu.value.tabId)
  contextMenu.value = { ...contextMenu.value, visible: false }
}
</script>

<style scoped lang="scss">
.title-bar {
  display: flex;
  align-items: flex-end;
  background: var(--tab-bar-bg);
  padding: 0 0 0 0;
  min-height: var(--title-bar-height);
  user-select: none;
  -webkit-app-region: drag;

  &.is-tab-dragging {
    -webkit-app-region: no-drag;
  }

  // macOS: base styles
  &.is-mac {
    -webkit-user-select: none;
    align-items: center;
    transition: padding-left 0.25s ease;
  }

  // macOS with native traffic lights visible (not fullscreen): add left padding
  // When icon is visible (fullscreen), reduce padding by icon width (78 - 36 = 42)
  &.is-mac-traffic {
    padding-left: 78px;
  }

  // macOS fullscreen with icon: reduce padding by icon width
  &.is-mac:not(.is-mac-traffic) {
    padding-left: 42px;
  }

  // Disable all transitions (used when exiting fullscreen)
  &.no-transition,
  &.no-transition .title-bar-icon {
    transition: none !important;
  }
}

.title-bar-icon {
  width: 0;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-top: 3px;
  margin-left: 0;
  color: var(--muted);
  overflow: hidden;
  opacity: 0;
  transition: width 0.25s ease, opacity 0.25s ease;

  &.icon-visible {
    width: 36px;
    margin-left: 1px;
    opacity: 1;
  }

  svg {
    opacity: 0.4;
  }
}

.tab-bar {
  display: flex;
  align-items: flex-end;
  flex: 1;
  gap: 2px;
  min-height: var(--title-bar-height);
  overflow: hidden;
  min-width: 0;
  flex-shrink: 1;

  // macOS: center tabs vertically to match traffic lights
  :global(.is-mac) & {
    align-items: center;
  }
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  cursor: default;
  transition: background var(--transition-normal), color var(--transition-normal), transform 0.18s ease;
  position: relative;
  overflow: hidden;
  max-width: 200px;
  min-width: 1px;
  flex: 1 1 0;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--tab-hover-bg);
    color: var(--fg);
  }

  &.active {
    background: var(--surface);
    color: var(--fg);
    border-color: var(--border);
  }

  &.tab-dragging {
    opacity: 0.85;
    background: var(--surface);
    border-color: var(--border);
    border-radius: 8px 8px 0 0;
    transition: none;
  }

  &.tab-drag-over {
    box-shadow: 2px 0 0 var(--border);
  }
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-title-input {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 6px;
  font: 12px var(--font-body);
  color: var(--fg);
  outline: none;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-close {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: default;
  display: grid;
  place-items: center;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  flex-shrink: 0;
  transition: background var(--transition-normal), color var(--transition-normal);
  -webkit-app-region: no-drag;

  &:hover {
    background: oklch(90% 0.01 25);
    color: var(--danger);
  }

  svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
}

.tab-add {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: default;
  display: grid;
  place-items: center;
  font-size: 18px;
  margin-bottom: 4px;
  margin-right: 12px;
  padding: 0;
  flex-shrink: 0;
  transition: background var(--transition-normal), color var(--transition-normal);
  -webkit-app-region: no-drag;

  &:hover {
    background: oklch(90% 0.005 240);
    color: var(--fg);
  }

  svg {
    width: 14px;
    height: 14px;
    stroke-width: 2;
  }
}

.window-controls {
  display: flex;
  align-items: center;
  height: var(--title-bar-height);
  -webkit-app-region: no-drag;
  flex-shrink: 0;
  margin-left: 6px;

  button {
    width: 46px;
    height: var(--title-bar-height);
    border: none;
    background: transparent;
    color: var(--fg);
    cursor: default;
    display: grid;
    place-items: center;
    transition: background var(--transition-normal), color var(--transition-normal);
    padding: 0;
    -webkit-app-region: no-drag;

    svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
  }

  .btn-minimize:hover,
  .btn-maximize:hover {
    background: oklch(90% 0.005 240);
  }

  .btn-close:hover {
    background: var(--danger-hover-bg);
    color: #fff;
  }

  .lang-switch {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: oklch(97% 0.003 240);
    color: var(--fg);
    cursor: default;
    display: grid;
    place-items: center;
    transition: background var(--transition-normal), border-color var(--transition-normal);
    padding: 0;
    font: 11px/1 var(--font-body);
    margin-right: 4px;

    &:hover {
      background: oklch(94% 0.005 240);
      border-color: oklch(80% 0.01 240);
    }
  }

  // macOS: only show language switch, no window controls
  &.mac-controls {
    button:not(.lang-switch) {
      display: none;
    }

    .lang-switch {
      margin-right: 8px;
    }
  }
}

.tab-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  -webkit-app-region: no-drag;

  .tab-context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--fg);
    cursor: default;
    transition: background var(--transition-normal);

    svg {
      flex-shrink: 0;
      stroke: var(--muted);
    }

    &:hover {
      background: var(--tab-hover-bg);
    }

    &.danger:hover {
      background: oklch(90% 0.01 25);
      color: var(--danger);
      svg { stroke: var(--danger); }
    }
  }
}
</style>
