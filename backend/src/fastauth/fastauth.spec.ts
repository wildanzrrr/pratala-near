import { HttpException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/app-config.service.js';
import type { NearRpcService } from '../common/near/rpc.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateAccountDto,
  SignTxDto,
  VerifySsoDto,
} from './fastauth.schemas.js';
import { signTxSchema } from './fastauth.schemas.js';
import { FastAuthService } from './fastauth.service.js';
import type { SponsorSignerService } from './fastauth.signer.service.js';

const SUB = 'auth0|test-1234';
const DERIVED_KEY = 'ed25519:DerivedPublicKey1111111111111111111111111111111';

function makeService(overrides: {
  sponsorConfigured?: boolean;
  derivedKey?: string;
  accountExists?: boolean;
  accessKey?: unknown;
} = {}) {
  const config = {
    get: (key: string) =>
      ({
        FASTAUTH_AUTH0_DOMAIN: 'login.testnet.fast-auth.com',
        FASTAUTH_AUTH0_AUDIENCE: 'https://api.testnet.fast-auth.com',
        FASTAUTH_CONTRACT_ID: 'fast-auth.testnet',
        FASTAUTH_MPC_CONTRACT_ID: 'v1.signer-prod.testnet',
        SPONSOR_SEED_NEAR: '0.5',
        SPONSOR_ACCOUNT_ID: 'sponsor.pratala.testnet',
      })[key],
  } as unknown as AppConfig;

  const createSponsoredAccount = vi.fn().mockResolvedValue({
    transaction_outcome: { id: 'TXHASH1111111111111111111111111111111111111111' },
  });
  const relaySign = vi.fn().mockResolvedValue({
    transaction_outcome: { id: 'SIGNHASH111111111111111111111111111111111111111' },
    status: { SuccessValue: 'c2lnLWJhc2U2NA==' },
  });
  const sponsor = {
    configured: overrides.sponsorConfigured ?? true,
    createSponsoredAccount,
    relaySign,
  } as unknown as SponsorSignerService;

  const viewAccessKey = vi
    .fn()
    .mockResolvedValue(overrides.accessKey ?? { permission: 'FullAccess' });
  const rpc = {
    view: vi.fn().mockResolvedValue(overrides.derivedKey ?? DERIVED_KEY),
    provider: {
      viewAccount: vi.fn().mockImplementation(() =>
        overrides.accountExists
          ? Promise.resolve({ amount: 1n })
          : Promise.reject(new Error('does not exist')),
      ),
      viewAccessKey,
    },
  } as unknown as NearRpcService;

  const createRow = vi.fn().mockResolvedValue({});
  const updateRow = vi.fn().mockResolvedValue({});
  const deleteRow = vi.fn().mockResolvedValue({});
  const findRow = vi.fn().mockResolvedValue(null);
  const prisma = {
    sponsoredAccount: { create: createRow, update: updateRow, delete: deleteRow, findUnique: findRow },
  } as unknown as PrismaService;

  const service = new FastAuthService(prisma, rpc, sponsor, config);
  // Unit tests stub the network JWKS verification; jose is covered by e2e.
  vi.spyOn(service, 'verifyAuth0Token').mockResolvedValue({ sub: SUB });
  return { service, sponsor, rpc, prisma, createSponsoredAccount, relaySign, createRow, updateRow, deleteRow, viewAccessKey, findRow };
}

const createDto: CreateAccountDto = {
  accountId: 'siti.sponsor.pratala.testnet',
  publicKey: DERIVED_KEY,
  token: 'a.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaa',
};

describe('FastAuthService.createAccount', () => {
  it('creates and funds the account, records the tx hash', async () => {
    const { service, createSponsoredAccount, updateRow } = makeService();
    const result = await service.createAccount(createDto);
    expect(result).toEqual({
      accountId: 'siti.sponsor.pratala.testnet',
      txHash: 'TXHASH1111111111111111111111111111111111111111',
      seedNear: '0.5',
    });
    expect(createSponsoredAccount).toHaveBeenCalledWith(
      'siti.sponsor.pratala.testnet',
      DERIVED_KEY,
      '0.5',
    );
    expect(updateRow).toHaveBeenCalledWith({
      where: { accountId: 'siti.sponsor.pratala.testnet' },
      data: { txHash: 'TXHASH1111111111111111111111111111111111111111' },
    });
  });

  it('rejects a public key not derived from the login', async () => {
    const { service } = makeService({ derivedKey: 'ed25519:OtherKey111111111111111111111111111111111111111' });
    await expect(
      service.createAccount({ ...createDto, publicKey: DERIVED_KEY }),
    ).rejects.toMatchObject({ response: { error: 'fastauth_key_mismatch' } });
  });

  it('refuses when the account already exists on-chain', async () => {
    const { service } = makeService({ accountExists: true });
    await expect(service.createAccount(createDto)).rejects.toMatchObject({
      response: { error: 'account_exists' },
    });
  });

  it('refuses a second seed (unique constraint) without touching the sponsor', async () => {
    const { service, createRow, createSponsoredAccount } = makeService();
    createRow.mockRejectedValue(
      new Error('Unique constraint failed'),
    );
    await expect(service.createAccount(createDto)).rejects.toMatchObject({
      response: { error: 'already_sponsored' },
    });
    expect(createSponsoredAccount).not.toHaveBeenCalled();
  });

  it('deletes the row and reports chain_unavailable when the funding tx fails', async () => {
    const { service, deleteRow, createSponsoredAccount } = makeService();
    createSponsoredAccount.mockRejectedValue(new Error('rpc down'));
    await expect(service.createAccount(createDto)).rejects.toMatchObject({
      response: { error: 'chain_unavailable' },
    });
    expect(deleteRow).toHaveBeenCalledWith({
      where: { accountId: 'siti.sponsor.pratala.testnet' },
    });
  });

  it('returns 503 sponsor_unconfigured when the sponsor wallet is not set', async () => {
    const { service } = makeService({ sponsorConfigured: false });
    await expect(service.createAccount(createDto)).rejects.toMatchObject({
      response: { error: 'sponsor_unconfigured' },
    });
  });
});

describe('FastAuthService.createAccount name validation', () => {
  it('rejects a name outside the sponsor namespace', async () => {
    const { service } = makeService();
    await expect(
      service.createAccount({ ...createDto, accountId: 'siti.pratala.testnet' }),
    ).rejects.toMatchObject({ response: { error: 'invalid_account_name' } });
  });

  it('rejects an invalid label (uppercase, too short, bad chars)', async () => {
    const { service } = makeService();
    for (const bad of ['Siti.sponsor.pratala.testnet', 'x.sponsor.pratala.testnet', 'si ti.sponsor.pratala.testnet', 'a'.repeat(33) + '.sponsor.pratala.testnet']) {
      await expect(
        service.createAccount({ ...createDto, accountId: bad }),
      ).rejects.toMatchObject({ response: { error: 'invalid_account_name' } });
    }
  });

  it('accepts a clean label under the sponsor', async () => {
    const { service, createSponsoredAccount } = makeService();
    await expect(
      service.createAccount({ ...createDto, accountId: 'siti-farms_2.sponsor.pratala.testnet' }),
    ).resolves.toMatchObject({ accountId: 'siti-farms_2.sponsor.pratala.testnet' });
    expect(createSponsoredAccount).toHaveBeenCalled();
  });
});

describe('FastAuthService.resolveAccount', () => {
  it('returns null when the login owns no account yet', async () => {
    const { service } = makeService();
    await expect(service.resolveAccount({ token: 't.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaa' })).resolves.toEqual({
      accountId: null,
      publicKey: DERIVED_KEY,
    });
  });

  it('returns the existing account for a returning login', async () => {
    const { service, findRow } = makeService();
    findRow.mockResolvedValue({ accountId: 'siti.sponsor.pratala.testnet' });
    await expect(service.resolveAccount({ token: 't.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaa' })).resolves.toEqual({
      accountId: 'siti.sponsor.pratala.testnet',
      publicKey: DERIVED_KEY,
    });
  });

  it('rejects an invalid token', async () => {
    const { service } = makeService();
    vi.spyOn(service, 'verifyAuth0Token').mockRejectedValue(new UnauthorizedException('no'));
    await expect(service.resolveAccount({ token: 't.b.b' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('FastAuthService.relaySignTx', () => {
  const signDto: SignTxDto = {
    guard_id: 'jwt#https://login.testnet.fast-auth.com/',
    verify_payload: 'b.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.bbb',
    sign_payload: [104, 101, 108, 108, 111],
    algorithm: 'eddsa',
  };

  it('relays the sign call with the payload verbatim', async () => {
    const { service, relaySign } = makeService();
    const result = await service.relaySignTx(signDto);
    expect(result.hash).toBe('SIGNHASH111111111111111111111111111111111111111');
    expect(relaySign).toHaveBeenCalledWith(
      expect.objectContaining({
        guardId: signDto.guard_id,
        verifyPayload: signDto.verify_payload,
        signPayload: [104, 101, 108, 108, 111],
        algorithm: 'eddsa',
      }),
    );
  });

  it('schema defaults algorithm to eddsa when the client omits it', () => {
    const parsed = signTxSchema.parse({
      guard_id: signDto.guard_id,
      verify_payload: signDto.verify_payload,
      sign_payload: [1, 2, 3],
    });
    expect(parsed.algorithm).toBe('eddsa');
  });

  it('verifies verify_payload against the signing audience, not the API audience', async () => {
    const { service } = makeService();
    const verify = vi.spyOn(service, 'verifyAuth0Token').mockResolvedValue({ sub: SUB });
    await service.relaySignTx(signDto);
    expect(verify).toHaveBeenCalledWith(signDto.verify_payload, 'auth0.jwt.fast-auth.testnet');
  });

  it('rejects an invalid Auth0 token before touching the chain', async () => {
    const { service, relaySign } = makeService();
    vi.spyOn(service, 'verifyAuth0Token').mockRejectedValue(
      new UnauthorizedException('Invalid NEAR Auth token'),
    );
    await expect(service.relaySignTx(signDto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(relaySign).not.toHaveBeenCalled();
  });

  it('returns 503 when the sponsor wallet is not configured', async () => {
    const { service } = makeService({ sponsorConfigured: false });
    await expect(service.relaySignTx(signDto)).rejects.toMatchObject({
      response: { error: 'sponsor_unconfigured' },
    });
  });
});

describe('FastAuthService.verifySsoBinding', () => {
  const ssoDto: VerifySsoDto = {
    accountId: 'siti.sponsor.pratala.testnet',
    publicKey: DERIVED_KEY,
    token: 'c.cccccccccccccccccccccccccccccccccccc.ccc',
  };

  it('accepts a matching derived full-access key', async () => {
    const { service } = makeService();
    await expect(service.verifySsoBinding(ssoDto)).resolves.toBeUndefined();
  });

  it('rejects a key mismatch', async () => {
    const { service } = makeService({
      derivedKey: 'ed25519:OtherKey111111111111111111111111111111111111111',
    });
    await expect(service.verifySsoBinding(ssoDto)).rejects.toMatchObject({
      response: { error: 'fastauth_key_mismatch' },
    });
  });

  it('rejects a function-call (non-full-access) key', async () => {
    const { service } = makeService({
      accessKey: { permission: { FunctionCall: { allowance: '1' } } },
    });
    await expect(service.verifySsoBinding(ssoDto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the account or key is missing on-chain', async () => {
    const { service, viewAccessKey } = makeService();
    viewAccessKey.mockRejectedValue(new Error('missing'));
    await expect(service.verifySsoBinding(ssoDto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('HttpException shapes', () => {
  it('apiError responses carry the snake_case code', async () => {
    const { service } = makeService({ accountExists: true });
    const err = await service.createAccount(createDto).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getResponse()).toMatchObject({ error: 'account_exists', custom: true });
  });
});
