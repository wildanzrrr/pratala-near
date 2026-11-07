import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KeyPair, KeyPairSigner } from 'near-api-js';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { NearRpcService } from '../src/common/near/rpc.service.js';

/**
 * NEAR RPC fake: no network. `viewAccessKey` reports FullAccess for the
 * test key and FunctionCall for `fcKey` (verifyMessage must reject it).
 */
const fullKey = KeyPair.fromRandom('ed25519');
const fcKey = KeyPair.fromRandom('ed25519');
const offline = () => Promise.reject(new Error('RPC disabled in e2e'));
const fakeRpc = {
  lotsContract: 'lots.pratala.testnet',
  pusdcContract: 'pusdc.pratala.testnet',
  provider: {
    viewAccessKey: vi.fn(({ publicKey }: { publicKey: string }) =>
      Promise.resolve({
        nonce: 1n,
        permission:
          String(publicKey) === fcKey.getPublicKey().toString()
            ? { FunctionCall: { allowance: null, receiver_id: 'lots.pratala.testnet', method_names: [] } }
            : 'FullAccess',
        block_hash: 'x',
        block_height: 1,
      }),
    ),
  },
  rpcReachable: () => Promise.resolve(false),
  contractState: () => Promise.resolve('unknown'),
  view: offline,
  getLot: offline,
  getLots: offline,
  getRoles: offline,
  listRole: offline,
  getConfig: offline,
  getStats: offline,
  txStatus: offline,
  blockTimestamp: () => Promise.resolve(null),
};

const ACCOUNT = `e2e-${randomBytes(4).toString('hex')}.testnet`;

async function signIn(server: App, key: KeyPair, accountId = ACCOUNT) {
  const ch = await request(server).post('/api/auth/challenge').send({ accountId }).expect(200);
  const signer = new KeyPairSigner(key);
  const signed = await signer.signNep413Message(accountId, {
    message: ch.body.message,
    recipient: ch.body.recipient,
    nonce: new Uint8Array(Buffer.from(ch.body.nonce, 'base64')),
  });
  const body = {
    accountId,
    publicKey: key.getPublicKey().toString(),
    signature: Buffer.from(signed.signature).toString('base64'),
    nonce: ch.body.nonce,
  };
  return { ch, body, res: await request(server).post('/api/auth/verify').send(body) };
}

describe('Pratala API (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let cookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NearRpcService)
      .useValue(fakeRpc)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('health', () => {
    it('reports db ok, chain unreachable and AI unconfigured', async () => {
      const res = await request(server).get('/api/health').expect(200);
      expect(res.body).toMatchObject({
        ok: true,
        db: 'ok',
        chain: { rpc: 'unreachable', lotsContract: 'unknown', pusdcContract: 'unknown' },
        ai: { configured: false, model: 'Qwen/Qwen3-VL-30B-A3B-Instruct', tier: 'private-tee' },
      });
    });
  });

  describe('auth (NEP-413)', () => {
    it('issues a 32-byte single-use challenge', async () => {
      const res = await request(server).post('/api/auth/challenge').send({ accountId: ACCOUNT }).expect(200);
      expect(Buffer.from(res.body.nonce, 'base64')).toHaveLength(32);
      expect(res.body).toMatchObject({ message: 'Sign in to Pratala', recipient: 'lots.pratala.testnet' });
      expect(Date.parse(res.body.expiresAt) - Date.now()).toBeGreaterThan(4 * 60_000);
    });

    it('rejects an invalid account id', async () => {
      await request(server).post('/api/auth/challenge').send({ accountId: 'Not An Account' }).expect(400);
    });

    it('verifies a locally signed NEP-413 payload and sets an httpOnly Lax cookie', async () => {
      const { res } = await signIn(server, fullKey);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accountId: ACCOUNT });
      const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const session = setCookie.find((c) => c.startsWith('pratala_session='));
      expect(session).toBeDefined();
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      cookie = session!.split(';')[0];
      expect(fakeRpc.provider.viewAccessKey).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT, publicKey: fullKey.getPublicKey().toString() }),
      );
    });

    it('returns the session on /auth/me (roles degrade to [] without chain)', async () => {
      const res = await request(server).get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(res.body).toMatchObject({ accountId: ACCOUNT, roles: [], profile: { accountId: ACCOUNT, locale: 'en' } });
      await request(server).get('/api/auth/me').expect(401);
    });

    it('refuses to reuse a challenge', async () => {
      const { body } = await signIn(server, fullKey);
      await request(server).post('/api/auth/verify').send(body).expect(401);
    });

    it('refuses a signature from a different key', async () => {
      const other = KeyPair.fromRandom('ed25519');
      const fresh = await request(server).post('/api/auth/challenge').send({ accountId: ACCOUNT }).expect(200);
      const signed = await new KeyPairSigner(other).signNep413Message(ACCOUNT, {
        message: fresh.body.message,
        recipient: fresh.body.recipient,
        nonce: new Uint8Array(Buffer.from(fresh.body.nonce, 'base64')),
      });
      await request(server)
        .post('/api/auth/verify')
        .send({
          accountId: ACCOUNT,
          publicKey: fullKey.getPublicKey().toString(),
          signature: Buffer.from(signed.signature).toString('base64'),
          nonce: fresh.body.nonce,
        })
        .expect(401);
    });

    it('refuses a function-call access key', async () => {
      const { res } = await signIn(server, fcKey);
      expect(res.status).toBe(401);
    });
  });

  describe('profile, evidence, AI', () => {
    it('updates the profile', async () => {
      const res = await request(server)
        .put('/api/users/me')
        .set('Cookie', cookie)
        .send({ displayName: 'Pak Tani', region: 'Jawa Barat', locale: 'en', intent: 'farmer' })
        .expect(200);
      expect(res.body).toMatchObject({ displayName: 'Pak Tani', locale: 'en', intent: 'farmer' });
      const pub = await request(server).get(`/api/users/${ACCOUNT}`).expect(200);
      expect(pub.body.phone).toBeUndefined();
    });

    it('stores an image by sha256 and serves it back', async () => {
      // 1x1 PNG
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const up = await request(server)
        .post('/api/evidence')
        .set('Cookie', cookie)
        .field('kind', 'PLOT')
        .attach('file', png, { filename: 'plot.png', contentType: 'image/png' })
        .expect(201);
      expect(up.body).toMatchObject({ mime: 'image/png', kind: 'PLOT', lat: null, lng: null });
      expect(up.body.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(up.body.uri).toBe(`http://localhost:4100/api/evidence/${up.body.sha256}`);
      const file = await request(server).get(`/api/evidence/${up.body.sha256}`).expect(200);
      expect(file.headers['content-type']).toBe('image/png');

      const plot = await request(server)
        .post('/api/plots')
        .set('Cookie', cookie)
        .send({ name: 'Sawah utara', lat: -6.914751, lng: 107.609812, areaM2: 1200, region: 'Jawa Barat', evidenceIds: [up.body.id] })
        .expect(201);
      expect(plot.body.plotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(plot.body.gpsHash).toMatch(/^[a-f0-9]{64}$/);

      const ai = await request(server)
        .post('/api/ai/check')
        .set('Cookie', cookie)
        .send({ evidenceId: up.body.id, kind: 'PLOT' })
        .expect(503);
      expect(ai.body.error).toBe('ai_unavailable');
    });

    it('rejects non-image uploads', async () => {
      await request(server)
        .post('/api/evidence')
        .set('Cookie', cookie)
        .field('kind', 'PLOT')
        .attach('file', Buffer.from('not an image, just text....'), { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(400);
    });
  });

  describe('intents quote validation (no network)', () => {
    const ok = {
      originAsset: 'nep141:a',
      destinationAsset: 'nep141:b',
      amount: '10',
      recipient: 'buyer.near',
      refundTo: '0x1234567890abcdef',
    };

    it.each([
      [{}, 'Missing required quote fields'],
      [{ ...ok, amount: '' }, 'Missing required quote fields'],
      [{ ...ok, refundTo: 'has space x' }, 'Recipient and refund addresses must be valid non-empty addresses'],
      [{ ...ok, slippageTolerance: 0 }, 'Slippage tolerance must be an integer from 1 to 5000 bps'],
      [{ ...ok, dry: 'yes' }, 'dry must be a boolean'],
    ])('400 for %j', async (body, error) => {
      const res = await request(server).post('/api/intents/quote').send(body).expect(400);
      expect(res.body.error).toBe(error);
    });
  });

  describe('chain-backed endpoints degrade without a contract', () => {
    it('GET /lots -> []', async () => {
      const res = await request(server).get('/api/lots?status=Listed').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /stats -> mirror counts', async () => {
      const res = await request(server).get('/api/stats').expect(200);
      expect(res.body).toMatchObject({ source: 'mirror', verifiers: 0 });
    });

    it('POST /tx validates the hash and reports the chain as unavailable', async () => {
      await request(server).post('/api/tx').send({ txHash: 'nope', signerId: ACCOUNT }).expect(400);
      const res = await request(server)
        .post('/api/tx')
        .send({ txHash: '4mVZ2hQk8hGvN3xEq9pW7cT1sYb6aR5dK2jL8nM3pQ7u', signerId: ACCOUNT })
        .expect(502);
      expect(res.body.error).toBe('chain_unavailable');
    });

    it('CSV export has a BOM and the documented header', async () => {
      const res = await request(server).get(`/api/payments/export.csv?account=${ACCOUNT}`).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
      expect(res.text.slice(1)).toBe(
        'date_utc,lot_id,crop,type,from_account,to_account,amount_pusdc,status,tx_hash,explorer_url,note\r\n',
      );
    });
  });
});
