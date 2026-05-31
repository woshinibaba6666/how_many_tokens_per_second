<template>
  <div class="config-panel">
    <div class="config-header">
      <span>{{ t('config.title') }}</span>
    </div>
    <div class="config-scroll">
      <!-- API Endpoint -->
      <div class="field api-field">
        <label>{{ t('config.endpoint') }}</label>
        <div class="input-wrapper">
          <InputGroup
            v-model="config.endpoint"
            :placeholder="'https://api.xxx.com/v1'"
            show-arrow
            :arrow-title="t('config.endpoint')"
            @arrow-click="() => toggleDropdown('api')"
          />
          <DropdownList
            v-model:visible="apiDropdownVisible"
            :items="currentEndpointPresets"
            :model-value="config.endpoint"
            item-type="endpoint"
            :empty-text="t('config.noPresets')"
            dropdown-class="api-dropdown"
            @select="onEndpointSelect"
          />
        </div>
      </div>

      <!-- API Key -->
      <div class="field">
        <label>{{ t('config.apiKey') }}</label>
        <InputGroup
          v-model="config.apiKey"
          :type="showKey ? 'text' : 'password'"
          :placeholder="'sk-...'"
          show-button
          :button-title="showKey ? t('config.hideKey') : t('config.showKey')"
          button-icon="eye"
          :button-revealed="showKey"
          @button-click="showKey = !showKey"
        />
      </div>

      <!-- Model ID -->
      <div class="field model-field">
        <label>{{ t('config.modelId') }}</label>
        <div class="input-wrapper">
          <InputGroup
            v-model="config.model"
            :placeholder="'gpt-4o-mini'"
            :show-arrow="modelList.length > 0"
            :arrow-title="t('config.modelId')"
            show-button
            :button-title="t('config.refreshModels')"
            button-icon="refresh"
            :button-revealed="isRefreshingModels"
            @arrow-click="() => toggleDropdown('model')"
            @button-click="refreshModels"
          />
          <DropdownList
            v-model:visible="modelDropdownVisible"
            :items="modelList"
            :model-value="config.model"
            item-type="model"
            :empty-text="t('config.noModels')"
            dropdown-class="model-dropdown"
            @select="onModelSelect"
          />
        </div>
      </div>

      <!-- User-Agent -->
      <div class="field ua-field">
        <label>{{ t('config.userAgent') }}</label>
        <div class="input-wrapper">
          <InputGroup
            v-model="config.userAgent"
            :placeholder="DEFAULT_USER_AGENT"
            show-arrow
            :arrow-title="t('config.userAgent')"
            @arrow-click="() => toggleDropdown('ua')"
          />
          <DropdownList
            v-model:visible="uaDropdownVisible"
            :items="USER_AGENT_PRESETS"
            :model-value="config.userAgent"
            item-type="userAgent"
            :empty-text="t('config.noPresets')"
            dropdown-class="ua-dropdown"
            @select="onUaSelect"
          />
        </div>
      </div>

      <!-- Concurrency -->
      <div class="field">
        <label>{{ t('config.concurrency') }}</label>
        <input
          v-model.number="config.concurrency"
          type="number"
          min="1"
          max="100"
          class="input-base"
          @input="onConcurrencyInput"
        />
      </div>

      <!-- Prompt -->
      <div class="field">
        <PromptInput
          v-model="config.prompt"
          :label="t('config.prompt')"
          :placeholder="t('config.promptPlaceholder')"
          :refresh-title="t('config.refreshPrompt')"
          :prompts="promptList"
        />
      </div>

      <!-- Start/Abort Button -->
      <button
        :class="(isRunning || isStopping) ? 'btn-danger' : 'btn-primary'"
        :disabled="isStopping"
        @click="onStartOrAbort"
      >
        {{ isStopping ? t('config.stopping') : isRunning ? t('config.abortTest') : t('config.startTest') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import InputGroup from '@presentation/components/InputGroup.vue'
import DropdownList from '@presentation/components/DropdownList.vue'
import PromptInput from '@presentation/components/PromptInput.vue'
import { DEFAULT_USER_AGENT } from '@domain/entities'
import type { IApiRepository } from '@domain/repositories'
import type { Tab } from '@presentation/stores/tabs'
import { showErrorDialog } from '@presentation/utils/error'
import { OPENAI_ENDPOINTS, USER_AGENT_PRESETS } from '@presentation/constants/presets'
import { PromptService } from '@infrastructure/services/PromptService'

const { t, te, locale } = useI18n()

interface Props {
  tab: Tab | null
  apiRepository: IApiRepository
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:config', config: Partial<Tab['config']>): void
  (e: 'start-test'): void
  (e: 'abort-test'): void
}>()

// Local reactive config copy for two-way binding
const config = ref({
  apiType: 'openai' as const,
  endpoint: '',
  apiKey: '',
  model: '',
  userAgent: DEFAULT_USER_AGENT,
  concurrency: 1,
  prompt: '',
  modelList: [] as string[],
})

const showKey = ref(false)
const isRefreshingModels = ref(false)
const modelList = ref<string[]>([])
const apiDropdownVisible = ref(false)
const modelDropdownVisible = ref(false)
const uaDropdownVisible = ref(false)

// Loaded prompts from file (zh or en based on locale)
const loadedPrompts = ref<string[]>([])

const promptService = new PromptService()

const currentEndpointPresets = computed(() =>
  OPENAI_ENDPOINTS.map((item) => ({
    ...item,
    label: item.i18nKey && te(item.i18nKey) ? t(item.i18nKey) : item.label,
  })),
)

const isRunning = computed(() =>
  props.tab?.status === 'running' || props.tab?.status === 'starting'
)
const isStopping = computed(() => props.tab?.status === 'stopping')

// Prompt list based on loaded prompts and current locale
const promptList = computed(() => loadedPrompts.value)

// Sync config from tab (skip when the difference is from our own emit)
watch(
  () => props.tab?.config,
  (tabConfig) => {
    if (!tabConfig) return
    const local = config.value
    if (
      tabConfig.endpoint === local.endpoint &&
      tabConfig.apiKey === local.apiKey &&
      tabConfig.model === local.model &&
      tabConfig.userAgent === local.userAgent &&
      tabConfig.concurrency === local.concurrency &&
      tabConfig.prompt === local.prompt &&
      JSON.stringify(tabConfig.modelList || []) === JSON.stringify(local.modelList)
    ) {
      return // Store change came from our own emit; no need to sync
    }
    config.value = { ...config.value, ...tabConfig }
    modelList.value = tabConfig.modelList || []
    if (!tabConfig.prompt && loadedPrompts.value.length > 0) {
      selectRandomPrompt()
    }
  },
  { immediate: true, deep: true }
)

// Watch locale changes to reload prompts
watch(
  () => locale.value,
  async () => {
    await loadPrompts()
    // Refresh prompt with new language if current prompt is empty or was auto-filled
    if (config.value.prompt === '' && loadedPrompts.value.length > 0) {
      selectRandomPrompt()
    }
  }
)

// Emit config changes back to store
watch(
  config,
  (newConfig) => {
    emit('update:config', { ...newConfig })
  },
  { deep: true }
)

type DropdownName = 'api' | 'model' | 'ua'

function toggleDropdown(name: DropdownName) {
  const states: Record<DropdownName, { value: boolean }> = {
    api: apiDropdownVisible,
    model: modelDropdownVisible,
    ua: uaDropdownVisible,
  }
  const isVisible = states[name]
  isVisible.value = !isVisible.value
  if (isVisible.value) {
    for (const [key, state] of Object.entries(states)) {
      if (key !== name) state.value = false
    }
  }
}

function onEndpointSelect(value: string) {
  config.value.endpoint = value
  apiDropdownVisible.value = false
}

function onModelSelect(value: string) {
  config.value.model = value
  modelDropdownVisible.value = false
}

function onUaSelect(value: string) {
  config.value.userAgent = value
  uaDropdownVisible.value = false
}

function onConcurrencyInput(event: Event) {
  const target = event.target as HTMLInputElement
  let val = parseInt(target.value) || 1
  val = Math.max(1, Math.min(100, val))
  config.value.concurrency = val
}

async function refreshModels() {
  if (isRefreshingModels.value) return
  isRefreshingModels.value = true
  modelDropdownVisible.value = false

  try {
    const models = await props.apiRepository.fetchModels({
      id: '',
      name: '',
      apiType: config.value.apiType,
      endpoint: config.value.endpoint,
      apiKey: config.value.apiKey,
      model: config.value.model,
      userAgent: config.value.userAgent,
      concurrency: config.value.concurrency,
      prompt: config.value.prompt,
      modelList: config.value.modelList,
    })

    modelList.value = models
    config.value.modelList = models
    if (models.length > 0 && !config.value.model) {
      config.value.model = models[0]
    }
  } catch (error) {
    showErrorDialog(
      error,
      t('error.fetchModelsFailed'),
      t('error.close'),
      (code, msg) => `${t('error.statusCode', { code })}\n${t('error.message', { msg })}`
    )
  } finally {
    isRefreshingModels.value = false
  }
}

function onStartOrAbort() {
  if (isRunning.value) {
    emit('abort-test')
  } else {
    emit('start-test')
  }
}

// Load prompts from file based on current locale
async function loadPrompts() {
  loadedPrompts.value = await promptService.loadPrompts(locale.value)
}

// Select a random prompt from the loaded list
function selectRandomPrompt() {
  if (loadedPrompts.value.length === 0) return
  const randomIndex = Math.floor(Math.random() * loadedPrompts.value.length)
  config.value.prompt = loadedPrompts.value[randomIndex]
}

onMounted(() => {
  loadPrompts()
})
</script>

<style scoped lang="scss">
.config-panel {
  width: var(--config-panel-width);
  min-width: var(--config-panel-min-width);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-header {
  height: 44px;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  box-sizing: border-box;
}

.config-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.field {
  margin-bottom: 16px;
  position: relative;

  label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 5px;
    letter-spacing: 0.02em;
  }
}

.input-wrapper {
  position: relative;
}

.input-base {
  width: 100%;
  height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--border-radius-md);
  background: var(--surface);
  color: var(--fg);
  font: 13px var(--font-body);
  outline: none;
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);

  &:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  &::placeholder {
    color: oklch(75% 0.01 250);
  }
}

.btn-primary {
  width: 100%;
  padding: 9px 14px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--accent);
  color: #fff;
  font: 13px/1 var(--font-body);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-normal), transform var(--transition-fast);

  &:hover {
    opacity: 0.92;
  }

  &:active {
    transform: scale(0.985);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
}

.btn-danger {
  width: 100%;
  padding: 9px 14px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--danger);
  color: #fff;
  font: 13px/1 var(--font-body);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-normal), transform var(--transition-fast);

  &:hover {
    opacity: 0.92;
  }

  &:active {
    transform: scale(0.985);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
}
</style>
