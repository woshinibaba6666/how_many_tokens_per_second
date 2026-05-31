import type { LabeledItem } from '@presentation/components/DropdownList.vue'

export const OPENAI_ENDPOINTS: LabeledItem[] = [
  { label: 'OpenAI', i18nKey: 'presets.endpoint.openai', url: 'https://api.openai.com/v1' },
  { label: 'Codex', i18nKey: 'presets.endpoint.codex', url: 'https://chatgpt.com/codex' },
  { label: 'Groq', i18nKey: 'presets.endpoint.groq', url: 'https://api.groq.com/openai/v1' },
  { label: 'Amazon Bedrock', i18nKey: 'presets.endpoint.amazonBedrock', url: 'https://bedrock-mantle.us-east-1.api.aws/v1' },
  { label: 'OpenCode Zen', i18nKey: 'presets.endpoint.opencodeZen', url: 'https://opencode.ai/zen/v1' },
  { label: 'OpenCode Go', i18nKey: 'presets.endpoint.opencodeGo', url: 'https://opencode.ai/zen/go/v1' },
  { label: 'OpenRouter', i18nKey: 'presets.endpoint.openrouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'Nvidia NIM', i18nKey: 'presets.endpoint.nvidiaNim', url: 'https://integrate.api.nvidia.com/v1' },
  { label: '阿里云百炼', i18nKey: 'presets.endpoint.aliyunBailian', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: '腾讯云混元', i18nKey: 'presets.endpoint.tencentHunyuan', url: 'https://api.hunyuan.cloud.tencent.com/v1' },
  { label: '百度千帆', i18nKey: 'presets.endpoint.baiduQianfan', url: 'https://qianfan.baidubce.com/v2' },
  { label: '火山引擎', i18nKey: 'presets.endpoint.volcanoEngine', url: 'https://ark.cn-beijing.volces.com/api/v3' },
  { label: 'DeepSeek 开放平台', i18nKey: 'presets.endpoint.deepseek', url: 'https://api.deepseek.com/v1' },
  { label: '月之暗面 开放平台', i18nKey: 'presets.endpoint.moonshot', url: 'https://api.moonshot.cn/v1' },
  { label: '月之暗面 Coding Plan', i18nKey: 'presets.endpoint.moonshotCoding', url: 'https://api.kimi.com/coding/v1' },
  { label: '智谱AI', i18nKey: 'presets.endpoint.zhipu', url: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: '智谱AI Coding Plan', i18nKey: 'presets.endpoint.zhipuCoding', url: 'https://open.bigmodel.cn/api/coding/paas/v4' },
  { label: 'MiniMax', i18nKey: 'presets.endpoint.minimax', url: 'https://api.minimaxi.com/v1' },
  { label: '小米 Mimo 开放平台', i18nKey: 'presets.endpoint.xiaomiMimo', url: 'https://api.mimo.mi.com/v1' },
  { label: '小米 Mimo Coding Plan', i18nKey: 'presets.endpoint.xiaomiMimoCoding', url: 'https://token-plan-cn.xiaomimimo.com/v1' },
  { label: '优云智算', i18nKey: 'presets.endpoint.youyun', url: 'https://api.modelverse.cn/v1' },
  { label: '优云智算 Coding Plan', i18nKey: 'presets.endpoint.youyunCoding', url: 'https://cp.compshare.cn/v1' },
  { label: '硅基流动', i18nKey: 'presets.endpoint.siliconflow', url: 'https://api.siliconflow.cn/v1' },
  { label: '讯飞星辰 Coding Plan', i18nKey: 'presets.endpoint.iflytekXingchen', url: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2' },
]

export const USER_AGENT_PRESETS: LabeledItem[] = [
  { label: 'claude-cli', value: 'claude-cli/2.1.154 (external, sdk-cli)' },
  { label: 'OpenClaw-Gateway', value: 'OpenClaw-Gateway/1.0' },
  { label: 'Chrome (Windows)', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
  { label: 'Chrome (macOS)', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
  { label: 'curl', value: 'curl/8.0.1' },
]
