<template>
  <div
    class="input-group"
    :class="{ 'is-focused': isFocused }"
  >
    <input
      ref="inputRef"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      @input="onInput"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @keydown="onKeydown"
    />

    <!-- Dropdown arrow -->
    <span
      v-if="showArrow"
      class="input-arrow"
      :title="arrowTitle"
      @click.stop="$emit('arrowClick')"
    >
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
        <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>

    <!-- Action button -->
    <button
      v-if="showButton"
      type="button"
      class="input-btn"
      :class="{ revealed: buttonRevealed && buttonIcon === 'eye' }"
      :data-icon="buttonIcon"
      :title="buttonTitle"
      @click.prevent="$emit('buttonClick')"
    >
      <slot name="button-icon">
        <svg v-if="buttonIcon === 'eye' && !buttonRevealed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <svg v-else-if="buttonIcon === 'eye' && buttonRevealed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        <svg v-else-if="buttonIcon === 'refresh'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spin: buttonRevealed }">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        <span v-else>{{ buttonIcon }}</span>
      </slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  modelValue: string
  type?: string
  placeholder?: string
  autocomplete?: string
  showArrow?: boolean
  showButton?: boolean
  arrowTitle?: string
  buttonTitle?: string
  buttonIcon?: string
  buttonRevealed?: boolean
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  autocomplete: 'off',
  showArrow: false,
  showButton: false,
  arrowTitle: '',
  buttonTitle: '',
  buttonIcon: '',
  buttonRevealed: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'arrowClick'): void
  (e: 'buttonClick'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function onKeydown(event: KeyboardEvent) {
  emit('keydown', event)
}

function focus() {
  inputRef.value?.focus()
}

function select() {
  inputRef.value?.select()
}

defineExpose({
  focus,
  select,
  inputRef,
})
</script>

<style scoped lang="scss">
.input-group {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0;
  border-radius: var(--border-radius-md);
  overflow: visible;

  &.is-focused {
    z-index: 2;
    outline: 3px solid var(--accent-glow);
    outline-offset: 2px;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-md);
    background: var(--surface);
    color: var(--fg);
    font: 13px var(--font-body);
    outline: none;
    transition: border-color var(--transition-normal);

    &:focus {
      border-color: var(--accent);
      box-shadow: none;
    }
  }

  // When arrow or button is present, round only left corners of input
  &:has(> .input-arrow:not(.hidden)),
  &:has(> .input-btn) {
    input {
      border-radius: var(--border-radius-md) 0 0 var(--border-radius-md);
    }
  }

  // Input + btn (no arrow): remove right border of input
  &:has(> .input-btn):not(:has(> .input-arrow:not(.hidden))) {
    input {
      border-right: none;

      &:focus {
        border-right-color: var(--border);
      }
    }
  }

  // Input + arrow: remove right border of input
  &:has(> .input-arrow:not(.hidden)) {
    input {
      border-right: none;
    }
  }

  // Input + arrow + btn: arrow has no right border
  &:has(> .input-arrow:not(.hidden)):has(> .input-btn) {
    .input-arrow {
      border-right: none;
    }
  }

  // Focus state for btn when input is focused (no visible arrow)
  &:has(> .input-btn):not(:has(> .input-arrow:not(.hidden))):has(input:focus) {
    .input-btn {
      border-color: var(--accent);
      border-left-color: var(--border);
    }
  }

  // Focus state for btn when input is focused (with visible arrow)
  &:has(> .input-arrow:not(.hidden)):has(> .input-btn):has(input:focus) {
    .input-btn {
      border-color: var(--accent);
      border-left-color: var(--border);
    }
  }

  // Arrow focus sync
  &:has(input:focus) .input-arrow {
    border-color: var(--accent);
  }

}

.input-arrow {
  width: 24px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 10px;
  cursor: pointer;
  border: 1px solid var(--border);
  border-left: none;
  border-radius: 0;
  background: transparent;
  user-select: none;
  transition: color var(--transition-normal), border-color var(--transition-normal);
  flex-shrink: 0;

  &:hover {
    color: var(--fg);
  }

  &:last-child {
    border-radius: 0 var(--border-radius-md) var(--border-radius-md) 0;
  }
}

.input-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--input-group-btn-bg);
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  transition: all var(--transition-normal);
  display: grid;
  place-items: center;
  flex-shrink: 0;

  &:last-child {
    border-radius: 0 var(--border-radius-md) var(--border-radius-md) 0;
  }

  &:hover {
    background: var(--input-group-btn-hover-bg);
    color: var(--fg);
  }

  &.revealed {
    position: relative;

    &::after {
      content: '';
      position: absolute;
      top: 52%;
      left: 50%;
      width: 0.5px;
      height: 40%;
      background: #000;
      transform: translate(-50%, -50%) rotate(-45deg);
      pointer-events: none;
    }
  }

  svg.spin {
    animation: spin 1s linear infinite;
  }
}
</style>
