<template>
  <div class="prompt-input">
    <div class="prompt-header">
      <label>{{ label }}</label>
      <button
        class="prompt-refresh-btn"
        :title="refreshTitle"
        @click="refreshPrompt"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          :class="{ spin: isSpinning }"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
    <textarea
      :value="modelValue"
      :placeholder="placeholder"
      rows="4"
      @input="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

interface Props {
  modelValue: string
  label?: string
  placeholder?: string
  refreshTitle?: string
  prompts?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  placeholder: '',
  refreshTitle: 'Random Refresh Prompt',
  prompts: () => [],
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isSpinning = ref(false)
let spinTimeout: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (spinTimeout) {
    clearTimeout(spinTimeout)
  }
})

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

function refreshPrompt() {
  if (props.prompts.length === 0) return

  isSpinning.value = true
  spinTimeout = setTimeout(() => {
    isSpinning.value = false
    spinTimeout = null
  }, 800)

  const current = props.modelValue
  let next: string
  do {
    next = props.prompts[Math.floor(Math.random() * props.prompts.length)]
  } while (next === current && props.prompts.length > 1)

  emit('update:modelValue', next)
}
</script>

<style scoped lang="scss">
.prompt-input {
  .prompt-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;

    label {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      letter-spacing: 0.02em;
      margin-bottom: 0;
    }
  }

  textarea {
    width: 100%;
    min-height: 80px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-md);
    background: var(--surface);
    color: var(--fg);
    font: 12px/1.6 var(--font-mono);
    outline: none;
    resize: vertical;
    transition: border-color var(--transition-normal), box-shadow var(--transition-normal);

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    &::placeholder {
      color: oklch(75% 0.01 250);
    }
  }
}

.prompt-refresh-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--border);
  background: oklch(97% 0.003 240);
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 13px;
  transition: all var(--transition-normal);
  padding: 0;

  &:hover {
    background: oklch(94% 0.005 240);
    color: var(--fg);
  }

  svg {
    display: block;
  }
}
</style>
