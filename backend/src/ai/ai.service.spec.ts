import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/app-config.service.js';
import type { EvidenceService } from '../evidence/evidence.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NearAiClient } from './ai.client.js';
import { AiService, buildVerifyUrl } from './ai.service.js';

const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

const MODEL = 'Qwen/Qwen3-VL-30B-A3B-Instruct';
const completionBody = JSON.stringify({
  id: 'chatcmpl-abc123',
  object: 'chat.completion',
  model: MODEL,
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content:
          '```json\n{"verdict":"pass","confidence":0.82,"findings":["Flooded rice paddy","Seedlings in rows"],' +
          '"extracted":{"crop":"rice","stage":"seedling","kg":null,"grade":null},' +
          '"summary_en":"Photo shows a young rice paddy."}\n```',
      },
    },
  ],
});

function makeService(apiKey: string | undefined) {
  const env: Record<string, unknown> = {
    NEAR_AI_VISION_MODEL: MODEL,
    NEAR_AI_FALLBACK_MODEL: 'z-ai/glm-5.3-flash',
    NEAR_AI_BASE_URL: 'https://cloud-api.near.ai/v1',
  };
  const config = { get: (k: string) => env[k] } as unknown as AppConfig;
  const evidenceRow = {
    id: '11111111-1111-4111-8111-111111111111',
    uploaderId: 'tani.testnet',
    lotId: null,
    mime: 'image/jpeg',
    lat: -6.91475,
    lng: 107.60981,
    capturedAt: new Date('2026-11-01T02:00:00Z'),
  };
  const evidence = {
    findById: vi.fn().mockResolvedValue(evidenceRow),
    readBytes: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
  } as unknown as EvidenceService;
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: '22222222-2222-4222-8222-222222222222',
    createdAt: new Date('2026-11-07T00:00:00Z'),
    ...data,
  }));
  const prisma = { aiCheck: { create } } as unknown as PrismaService;
  const client = apiKey ? new NearAiClient('https://cloud-api.near.ai/v1', apiKey) : null;
  return { service: new AiService(prisma, evidence, config, client), create };
}

describe('AiService (NEAR AI Cloud, openai SDK mocked)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    createMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns 503 ai_unavailable when NEAR_AI_API_KEY is empty', async () => {
    const { service } = makeService(undefined);
    const err = await service
      .check({ evidenceId: '11111111-1111-4111-8111-111111111111', kind: 'PLOT' }, 'tani.testnet')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toMatchObject({ error: 'ai_unavailable' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('sends the image as a data URL, stores hashes and the TEE signature', async () => {
    createMock.mockReturnValue({
      asResponse: () => Promise.resolve(new Response(completionBody, { status: 200 })),
    });
    const responseHash = createHash('sha256').update(completionBody).digest('hex');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          text: `${MODEL}:reqhash:${responseHash}`,
          signature: '0xsig',
          signing_address: '0xabc',
          signing_algo: 'ecdsa',
          signature_kind: 'provider_tee',
        }),
        { status: 200 },
      ),
    );

    const { service, create } = makeService('test-key');
    const view = await service.check(
      { evidenceId: '11111111-1111-4111-8111-111111111111', kind: 'FIELD_VISIT', expectedCrop: 'rice' },
      'tani.testnet',
    );

    const [body, opts] = createMock.mock.calls[0] as [Record<string, any>, Record<string, any>];
    expect(body.model).toBe(MODEL);
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.messages[1].content[0].text).toContain('Expected crop: rice');
    expect(body.messages[1].content[0].text).toContain('"summary_en"');
    expect(body.messages[1].content[0].text).not.toContain('summary_id');
    expect(opts.headers['x-no-aliasing']).toBe('true');

    const sigUrl = String(fetchMock.mock.calls[0][0]);
    expect(sigUrl).toBe(
      'https://cloud-api.near.ai/v1/signature/chatcmpl-abc123?model=Qwen%2FQwen3-VL-30B-A3B-Instruct&signing_algo=ecdsa',
    );

    expect(view).toMatchObject({
      provider: 'near-ai-cloud',
      model: MODEL,
      tier: 'private-tee',
      chatId: 'chatcmpl-abc123',
      verdict: 'pass',
      confidence: 0.82,
      extracted: { crop: 'rice', stage: 'seedling' },
      summaryEn: 'Photo shows a young rice paddy.',
      responseHash,
      signatureAvailable: true,
    });
    expect(view).not.toHaveProperty('summaryId');
    expect(view.verifyUrl).toMatch(
      /^https:\/\/cloud\.near\.ai\/verify\?model=Qwen%2FQwen3-VL-30B-A3B-Instruct#receipt=/,
    );
    const stored = create.mock.calls[0][0].data;
    expect(stored.responseText).toBe(completionBody);
  });

  it('falls back to the second model when the first fails, and tolerates no signature', async () => {
    createMock
      .mockReturnValueOnce({ asResponse: () => Promise.reject(new Error('model overloaded')) })
      .mockReturnValueOnce({
        asResponse: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ id: 'chat-2', choices: [{ message: { content: 'not json at all' } }] }),
            ),
          ),
      });
    fetchMock.mockResolvedValue(new Response('{"detail":"Chat id not found"}', { status: 404 }));
    const { service } = makeService('test-key');
    const view = await service.check(
      { evidenceId: '11111111-1111-4111-8111-111111111111', kind: 'WEIGH_IN' },
      'tani.testnet',
    );
    expect(view.model).toBe('z-ai/glm-5.3-flash');
    expect(view.verdict).toBe('review');
    expect(view.signatureAvailable).toBe(false);
    expect(view.verifyUrl).toBe('https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash');
  }, 10_000);
});

describe('buildVerifyUrl', () => {
  it('encodes a base64url receipt in the fragment', () => {
    const url = buildVerifyUrl('m/x', 'c1', {
      text: 't',
      signature: 's',
      signing_address: 'a',
      signing_algo: 'ecdsa',
      signature_kind: 'gateway',
    });
    const receipt = JSON.parse(
      Buffer.from(url.split('#receipt=')[1], 'base64url').toString('utf8'),
    ) as Record<string, string>;
    expect(receipt).toEqual({
      completionId: 'c1',
      model: 'm/x',
      signatureKind: 'gateway',
      signingAlgo: 'ecdsa',
      signingAddress: 'a',
      signedText: 't',
      signature: 's',
    });
  });
});
