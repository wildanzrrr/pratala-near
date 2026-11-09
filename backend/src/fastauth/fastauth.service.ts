import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.service.js';
import { NearRpcService } from '../common/near/rpc.service.js';
import { apiError } from '../common/filters/http-exception.filter.js';
import type {
  CreateAccountDto,
  ResolveAccountDto,
  SignTxDto,
  VerifySsoDto,
} from './fastauth.schemas.js';
import { SponsorNotConfiguredError, SponsorSignerService } from './fastauth.signer.service.js';

/** ed25519 domain on the NEAR MPC contract (see @fast-auth-near getDomainIdOrFail). */
const ED25519_DOMAIN_ID = 1;

/**
 * NEAR Auth (docs.auth.near.org) account service: email/Google/Apple SSO users
 * get a non-custodial MPC account whose key is derived deterministically from
 * their Auth0 identity. This service binds an Auth0 identity to a NEAR account
 * without ever seeing a private key:
 *
 *   1. verify the Auth0 JWT (RS256, via the tenant's JWKS),
 *   2. derive the identity's expected MPC public key with the public
 *      `derived_public_key` view call on the MPC contract,
 *   3. check that key is a full-access key of the claimed account on-chain.
 *
 * Only then does the sponsor wallet pay for account creation (+ gas seed) or
 * relay an MPC `sign` call.
 */
@Injectable()
export class FastAuthService {
  private readonly logger = new Logger(FastAuthService.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rpc: NearRpcService,
    private readonly sponsor: SponsorSignerService,
    private readonly config: AppConfig,
  ) {
    const domain = this.config.get('FASTAUTH_AUTH0_DOMAIN');
    this.jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  }

  /** Verifies an Auth0 access token for the NEAR Auth signing audience. */
  async verifyAuth0Token(token: string): Promise<{ sub: string }> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://${this.config.get('FASTAUTH_AUTH0_DOMAIN')}/`,
        audience: this.config.get('FASTAUTH_AUTH0_AUDIENCE'),
        algorithms: ['RS256'],
      });
      if (!payload.sub) throw new Error('token has no sub');
      return { sub: payload.sub };
    } catch (err) {
      this.logger.debug(`Auth0 token verify failed: ${String(err)}`);
      throw new UnauthorizedException('Invalid NEAR Auth token');
    }
  }

  /** The MPC key an Auth0 identity deterministically owns (ed25519 domain). */
  async derivedPublicKey(sub: string): Promise<string> {
    const path = `jwt#https://${this.config.get('FASTAUTH_AUTH0_DOMAIN')}/#${sub}`;
    const key = await this.rpc.view<string>(
      this.config.get('FASTAUTH_MPC_CONTRACT_ID'),
      'derived_public_key',
      { path, predecessor: this.config.get('FASTAUTH_CONTRACT_ID'), domain_id: ED25519_DOMAIN_ID },
    );
    if (!key) throw apiError(502, 'chain_unavailable', { detail: 'derived_public_key failed' });
    return key;
  }

  /**
   * Which account a login already owns (if any), plus the MPC key it derives.
   * Lets returning email users skip name selection on every device.
   */
  async resolveAccount(dto: ResolveAccountDto): Promise<{
    accountId: string | null;
    publicKey: string;
  }> {
    const { sub } = await this.verifyAuth0Token(dto.token);
    const publicKey = await this.derivedPublicKey(sub);
    const row = await this.prisma.sponsoredAccount.findUnique({
      where: { authSub: sub },
    });
    return { accountId: row?.accountId ?? null, publicKey };
  }

  /**
   * Validates a chosen account name: `<label>.<sponsor>` only (testnet lets
   * the sponsor create just its own subaccounts) with a clean 2–32 char label.
   */
  private validateChosenAccountId(accountId: string): void {
    const sponsorId = this.config.get('SPONSOR_ACCOUNT_ID');
    const suffix = sponsorId ? `.${sponsorId}` : '';
    const label = suffix && accountId.endsWith(suffix)
      ? accountId.slice(0, accountId.length - suffix.length)
      : null;
    if (!label || !/^[a-z0-9][a-z0-9_-]{0,30}[a-z0-9]$/.test(label)) {
      throw apiError(400, 'invalid_account_name', {
        detail: `account id must be <name>${suffix || '.<sponsor>'} (2–32 chars: a-z, 0-9, -, _)`,
      });
    }
  }

  /**
   * Creates + funds a NEAR Auth account for a verified identity. The user
   * chooses the name (validated above); the chain-level duplicate guard is the
   * on-chain existence check. One seed per identity and per account, ever
   * (Prisma unique constraints); the funding tx is a CreateAccount +
   * AddKey(full access) + Transfer batch from the sponsor.
   */
  async createAccount(dto: CreateAccountDto): Promise<{
    accountId: string;
    txHash: string;
    seedNear: string;
  }> {
    if (!this.sponsor.configured) throw apiError(503, 'sponsor_unconfigured');
    this.validateChosenAccountId(dto.accountId);

    const { sub } = await this.verifyAuth0Token(dto.token);
    const derived = await this.derivedPublicKey(sub);
    if (derived !== dto.publicKey) {
      throw apiError(401, 'fastauth_key_mismatch', {
        detail: 'public key is not the one derived from this login',
      });
    }

    const exists = await this.rpc.provider
      .viewAccount({ accountId: dto.accountId })
      .then(() => true)
      .catch(() => false);
    if (exists) throw apiError(409, 'account_exists');

    const seedNear = this.config.get('SPONSOR_SEED_NEAR');
    try {
      await this.prisma.sponsoredAccount.create({
        data: { accountId: dto.accountId, authSub: sub, publicKey: dto.publicKey },
      });
    } catch {
      throw apiError(409, 'already_sponsored', {
        detail: 'this account or login already received a Pratala gas seed',
      });
    }

    try {
      const outcome = await this.sponsor.createSponsoredAccount(
        dto.accountId,
        dto.publicKey,
        seedNear,
      );
      const txHash = outcome.transaction_outcome.id;
      await this.prisma.sponsoredAccount.update({
        where: { accountId: dto.accountId },
        data: { txHash },
      });
      return { accountId: dto.accountId, txHash, seedNear };
    } catch (err) {
      // Compensate so the user can retry without hitting the unique constraint.
      await this.prisma.sponsoredAccount
        .delete({ where: { accountId: dto.accountId } })
        .catch(() => undefined);
      this.logger.error(`sponsor create-account failed: ${String(err)}`);
      throw apiError(502, 'chain_unavailable', { detail: 'account creation tx failed' });
    }
  }

  /**
   * NEAR Auth relayer protocol: submits the `sign` call to the fast-auth
   * contract with the sponsor paying gas. The contract's guard verifies the
   * JWT against its issuer before the MPC network signs; we pre-verify the JWT
   * too so invalid requests never reach the chain.
   */
  async relaySignTx(dto: SignTxDto): Promise<{ hash: string; result: unknown }> {
    if (!this.sponsor.configured) throw apiError(503, 'sponsor_unconfigured');

    await this.verifyAuth0Token(dto.verify_payload);

    let outcome;
    try {
      outcome = await this.sponsor.relaySign({
        contractId: this.config.get('FASTAUTH_CONTRACT_ID'),
        guardId: dto.guard_id,
        verifyPayload: dto.verify_payload,
        signPayload: dto.sign_payload,
        algorithm: dto.algorithm,
      });
    } catch (err) {
      if (err instanceof SponsorNotConfiguredError) throw apiError(503, 'sponsor_unconfigured');
      this.logger.error(`relay sign-tx failed: ${String(err)}`);
      throw apiError(502, 'chain_unavailable', { detail: 'sign relay tx failed' });
    }
    return { hash: outcome.transaction_outcome.id, result: outcome };
  }

  /**
   * Backend-login binding for SSO accounts (no NEP-413 — the SDK cannot sign
   * arbitrary messages yet): Auth0 token verified, derived key matches, and the
   * key is a full-access key of the account on-chain.
   */
  async verifySsoBinding(dto: VerifySsoDto): Promise<void> {
    const { sub } = await this.verifyAuth0Token(dto.token);
    const derived = await this.derivedPublicKey(sub);
    if (derived !== dto.publicKey) {
      throw apiError(401, 'fastauth_key_mismatch', {
        detail: 'public key is not the one derived from this login',
      });
    }
    let accessKey;
    try {
      accessKey = await this.rpc.provider.viewAccessKey({
        accountId: dto.accountId,
        publicKey: dto.publicKey,
      });
    } catch {
      throw new UnauthorizedException('Account or key not found on-chain');
    }
    if (accessKey.permission !== 'FullAccess') {
      throw new UnauthorizedException('Key is not a full-access key of the account');
    }
  }
}
