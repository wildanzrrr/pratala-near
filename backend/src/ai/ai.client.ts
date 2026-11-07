import OpenAI from 'openai';
import { AppConfig } from '../config/app-config.service.js';

export const AI_CLIENT = Symbol('AI_CLIENT');

/** Minimal surface used by AiService, so tests can inject a fake. */
export interface AiClient {
  /** POST /chat/completions; returns the exact body text received. */
  complete(body: Record<string, unknown>): Promise<{ status: number; text: string }>;
  /** GET /signature/{chatId}; null when unavailable (404 / error payload). */
  signature(chatId: string, model: string): Promise<Record<string, unknown> | null>;
}

/**
 * NEAR AI Cloud via the official `openai` SDK (baseURL = NEAR_AI_BASE_URL).
 * `.asResponse()` keeps the raw bytes so responseHash matches what the TEE signed.
 */
export class NearAiClient implements AiClient {
  private readonly openai: OpenAI;

  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
  ) {
    this.openai = new OpenAI({ baseURL, apiKey, timeout: 60_000, maxRetries: 1 });
  }

  async complete(body: Record<string, unknown>) {
    const res = await this.openai.chat.completions
      .create(body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming, {
        headers: { 'x-no-aliasing': 'true' },
      })
      .asResponse();
    return { status: res.status, text: await res.text() };
  }

  async signature(chatId: string, model: string) {
    const url = new URL(`${this.baseURL.replace(/\/$/, '')}/signature/${encodeURIComponent(chatId)}`);
    url.searchParams.set('model', model);
    url.searchParams.set('signing_algo', 'ecdsa');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data || typeof data.signature !== 'string' || 'error_code' in data) return null;
    return data;
  }
}

export function createAiClient(config: AppConfig): AiClient | null {
  const key = config.get('NEAR_AI_API_KEY');
  return key ? new NearAiClient(config.get('NEAR_AI_BASE_URL'), key) : null;
}
