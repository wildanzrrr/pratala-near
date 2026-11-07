/**
 * NEAR AI Cloud privacy tier per model, confirmed 2026-11-07 against the public
 * catalog `GET https://cloud-api.near.ai/v1/model/list`:
 *   Qwen/Qwen3-VL-30B-A3B-Instruct  verifiable=true attestationSupported=true providerType=vllm  -> private-tee
 *   z-ai/glm-5.3-flash              verifiable=true attestationSupported=true providerType=vllm  -> private-tee
 * Models with providerType=external (OpenAI/Anthropic/Google/xAI) are "anonymised"
 * (proxied, not TEE). Unknown ids report "unknown" rather than over-claiming.
 */
const PRIVATE_TEE = new Set([
  'Qwen/Qwen3-VL-30B-A3B-Instruct',
  'z-ai/glm-5.3-flash',
  'Qwen/Qwen3.8-27B',
  'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  'moonshotai/kimi-k2.6',
]);

const ANONYMISED_PREFIXES = [
  'anthropic/',
  'openai/',
  'google/',
  'x-ai/',
  'deepseek/',
];

export type ModelTier = 'private-tee' | 'anonymised' | 'unknown';

export function modelTier(model: string): ModelTier {
  if (PRIVATE_TEE.has(model)) return 'private-tee';
  if (ANONYMISED_PREFIXES.some((p) => model.startsWith(p))) return 'anonymised';
  return 'unknown';
}
