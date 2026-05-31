<template>
  <div class="result-panel">
    <!-- Header -->
    <div class="result-header">
      <span class="result-title">{{ t('threadView.title') }}</span>
      <button
        v-if="showClearButton"
        class="btn-secondary"
        @click="onClear"
      >
        {{ t('threadView.clearResults') }}
      </button>
    </div>

    <!-- Summary Bar -->
    <div v-if="showSummary" class="summary-bar">
      <div class="summary-item">
        <span class="label">{{ t('summary.totalTime') }}</span>
        <span class="value">{{ summaryValue(result, 'totalTime', 's') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.totalTokens') }}</span>
        <span class="value">{{ summaryValue(result, 'totalTokens') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.avgSpeed') }}</span>
        <span class="value">{{ summaryValue(result, 'avgTps', 't/s') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.peakSpeed') }}</span>
        <span class="value">{{ summaryValue(result, 'peakTps', 't/s') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.firstTokenDelay') }}</span>
        <span class="value">{{ summaryValue(result, 'avgFirstTokenTime', 's') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.successRate') }}</span>
        <span class="value">{{ summaryValue(result, 'successRate', '%') }}</span>
      </div>
      <div class="summary-item">
        <span class="label">{{ t('summary.rating') }}</span>
        <span :class="['rating', getRatingClass(result?.label)]">
          {{ result?.label ? t('rating.' + result.label) : '-' }}
        </span>
      </div>
    </div>

    <!-- Threads Area -->
    <div class="threads-area">
      <!-- Empty State -->
      <div v-if="isEmpty" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <p>{{ t('threadView.emptyState') }}</p>
      </div>

      <!-- Waiting State -->
      <div v-else-if="isWaiting" class="empty-state">
        <p>{{ t('threadView.waiting') }}</p>
      </div>

      <!-- Thread Cards Grid -->
      <div v-else class="threads-grid">
        <div
          v-for="(thread, index) in threads"
          :key="thread.id"
          :class="['thread-card', thread.status]"
        >
          <!-- Thread Header -->
          <div class="thread-header">
            <span class="status">
              <span :class="['status-dot', thread.status]"></span>
              {{ t('threadView.thread', { n: index + 1 }) }}
            </span>
            <span v-if="thread.status === 'success' && thread.tps > 0" class="thread-speed">{{ thread.tps.toFixed(1) }} t/s</span>
          </div>

          <!-- Thread Body -->
          <div
            ref="threadBodyRefs"
            class="thread-body"
            @scroll="onThreadScroll($event, index)"
          >
            <!-- Thinking -->
            <div v-if="hasThinking(thread)" class="thinking-block">
              <div class="thinking-label">{{ t('threadView.thinking') }}</div>
              <div class="thinking-content md-body" v-html="renderMarkdown(getThinking(thread))"></div>
            </div>

            <!-- Content -->
            <div v-if="hasContent(thread)" class="md-body" v-html="renderMarkdown(getContent(thread))">
            </div>

            <!-- Error -->
            <div v-if="thread.status === 'error' && thread.error" class="error-text">
              {{ thread.error }}
            </div>

            <!-- Waiting -->
            <div v-if="thread.status === 'running' && !hasContent(thread) && !hasThinking(thread)" class="waiting-text">
              {{ t('threadView.waiting') }}
            </div>
          </div>

          <!-- Thread Footer -->
          <div class="thread-footer">
            <span v-if="thread.status !== 'running'">
              {{ thread.tokens > 0 ? t('threadView.tokens', { n: thread.tokens }) : '' }}
              {{ thread.firstTokenTime > 0 ? ' · ' + t('threadView.firstToken', { n: thread.firstTokenTime.toFixed(2) }) : '' }}
            </span>
            <span class="footer-right">{{ thread.time > 0 ? thread.time.toFixed(2) + 's' : '' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThreadResult, SummaryResult } from '@domain/entities'
import { renderMarkdown } from '@presentation/utils/markdown'
import { useThreadDisplay } from '@presentation/composables/useThreadDisplay'

const { t } = useI18n()
const { summaryValue, getRatingClass, hasThinking, getThinking, hasContent, getContent } = useThreadDisplay()

interface Props {
  threads: ThreadResult[]
  result: SummaryResult | null
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'done'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'clear'): void
}>()

const threadBodyRefs = ref<HTMLElement[]>([])
const autoScrollEnabled = ref<boolean[]>([])

const isEmpty = computed(() => props.threads.length === 0 && props.status === 'idle')
const isWaiting = computed(() => props.threads.length === 0 && (props.status === 'running' || props.status === 'starting'))
const showSummary = computed(() => props.status === 'running' || props.status === 'stopping' || props.status === 'done')
const showClearButton = computed(() => props.status === 'done')

function onThreadScroll(event: Event, index: number) {
  const el = event.target as HTMLElement
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10
  autoScrollEnabled.value[index] = isAtBottom
}

function onClear() {
  emit('clear')
}

// Auto-scroll to bottom when threads update
watch(
  () => props.threads,
  async () => {
    await nextTick()
    threadBodyRefs.value.forEach((el, index) => {
      if (!el) return
      if (autoScrollEnabled.value[index] !== false) {
        el.scrollTop = el.scrollHeight
      }
    })
  },
  { deep: true }
)

// Initialize auto-scroll for new threads
watch(
  () => props.threads.length,
  (newLen, oldLen) => {
    if (newLen > (oldLen || 0)) {
      for (let i = oldLen || 0; i < newLen; i++) {
        autoScrollEnabled.value[i] = true
      }
    }
  }
)
</script>

<style scoped lang="scss">
.result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.result-header {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
}

.result-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--fg);
}

.btn-secondary {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--border-radius-md);
  background: var(--surface);
  color: var(--fg);
  font: 12px var(--font-body);
  cursor: pointer;
  transition: background var(--transition-normal);
  flex-shrink: 0;

  &:hover {
    background: oklch(97% 0.003 240);
  }
}

.summary-bar {
  display: flex;
  gap: 20px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font: 12px var(--font-body);
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 6px;

  .value {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }

  .label {
    color: var(--muted);
  }
}

.threads-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.threads-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}

.thread-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 180px;

  &.running {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px oklch(58% 0.18 255 / 0.15);
  }

  &.success {
    border-color: var(--success);
  }

  &.error {
    border-color: var(--danger);
  }
}

.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font: 11px var(--font-body);
  font-weight: 600;
  background: var(--thread-header-bg);

  .status {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}

.thread-speed {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--fg);
  font-size: 12px;
}

.thread-body {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  max-height: 260px;
  font: 12px/1.6 var(--font-mono);
}

.thinking-block {
  background: oklch(97% 0.01 250 / 0.5);
  border-left: 2px solid var(--accent);
  padding: 6px 8px;
  border-radius: 0 5px 5px 0;
  margin: 4px 0;
  color: var(--muted);
  font-size: 12px;

  .thinking-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 2px;
    font-style: normal;
  }

  .thinking-content {
    word-break: break-word;

    // Ensure MathJax SVG renders with correct color, not inherited muted/italic
    svg {
      color: var(--fg);
    }
    mjx-container {
      color: var(--fg) !important;
    }

    // Override MathJax merror default yellow-bg red-text style.
    // In the SVG MathJax produces, the error <g> has a <rect> (bg) +
    // <text> (message). Replace opaque yellow fill with transparent
    // and red text with the normal foreground color.
    [data-mjx-error] {
      rect {
        fill: transparent !important;
      }
      text {
        fill: var(--fg) !important;
      }
    }
  }
}

.error-text {
  color: var(--danger);
  margin-top: 8px;
  font-size: 12px;
}

.waiting-text {
  color: var(--muted);
  font-size: 12px;
}

.thread-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  background: var(--thread-footer-bg);
  font: 11px var(--font-mono);
  color: var(--muted);
  font-variant-numeric: tabular-nums;

  .footer-right {
    margin-left: auto;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  gap: 8px;

  svg {
    opacity: 0.4;
  }

  p {
    font-size: 13px;
  }
}

</style>
