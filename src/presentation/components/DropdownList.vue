<template>
  <div
    v-show="visible"
    ref="dropdownRef"
    class="dropdown-list"
    :class="dropdownClass"
    @click="onItemClick"
  >
    <div
      v-if="items.length === 0"
      class="dropdown-empty"
    >
      {{ emptyText }}
    </div>
    <div
      v-for="item in items"
      :key="itemKey(item)"
      class="dropdown-item"
      :class="{ selected: isSelected(item) }"
      :data-value="itemValue(item)"
    >
      <template v-if="itemType === 'model'">
        {{ item as string }}
      </template>
      <template v-else>
        <div class="dropdown-item-label">{{ (item as LabeledItem).label }}</div>
        <div
          v-if="(item as LabeledItem).value || (item as LabeledItem).url"
          class="dropdown-item-sublabel"
        >
          {{ (item as LabeledItem).value || (item as LabeledItem).url }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

export interface LabeledItem {
  label: string
  value?: string
  url?: string
  type?: string
  i18nKey?: string
}

type DropdownItem = string | LabeledItem

interface Props {
  visible: boolean
  items: DropdownItem[]
  modelValue: string
  itemType?: 'model' | 'endpoint' | 'userAgent'
  emptyText?: string
  dropdownClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  itemType: 'model',
  emptyText: '',
  dropdownClass: '',
})

const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void
  (e: 'select', value: string, item: DropdownItem): void
}>()

const dropdownRef = ref<HTMLElement | null>(null)

function itemKey(item: DropdownItem): string {
  if (typeof item === 'string') return item
  return item.label + (item.value || item.url || '')
}

function itemValue(item: DropdownItem): string {
  if (typeof item === 'string') return item
  return item.value || item.url || item.label
}

function isSelected(item: DropdownItem): boolean {
  const val = itemValue(item)
  return val === props.modelValue
}

function onItemClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const itemEl = target.closest('.dropdown-item') as HTMLElement | null
  if (!itemEl) return

  const value = itemEl.dataset.value
  if (value !== undefined) {
    const foundItem = props.items.find((it) => itemValue(it) === value)
    emit('select', value, foundItem || value)
    emit('update:visible', false)
  }
}

function handleClickOutside(event: MouseEvent) {
  if (!dropdownRef.value) return
  const target = event.target as HTMLElement
  if (!dropdownRef.value.contains(target)) {
    emit('update:visible', false)
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped lang="scss">
.dropdown-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 32px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--border-radius-md);
  box-shadow: var(--dropdown-shadow);
  z-index: 100;
  font: 12px var(--font-body);
}

.dropdown-item {
  padding: 7px 10px;
  cursor: pointer;
  color: var(--fg);
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: oklch(97% 0.005 240);
  }

  &.selected {
    background: var(--accent-subtle);
  }
}

.dropdown-item-label {
  font-weight: 600;
  font-size: 12px;
}

.dropdown-item-sublabel {
  font-size: 11px;
  color: var(--muted);
  margin-top: 1px;
}

.dropdown-empty {
  padding: 10px;
  color: var(--muted);
  text-align: center;
}
</style>
