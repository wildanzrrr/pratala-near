import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import type { KeyPairString } from 'near-api-js';
import {
  Account,
  KeyPair,
  KeyPairSigner,
  PublicKey,
  actions,
  nearToYocto,
} from 'near-api-js';
import { AppConfig } from '../config/app-config.service.js';
import { NearRpcService } from '../common/near/rpc.service.js';

export class SponsorNotConfiguredError extends Error {
  constructor() {
    super('Sponsor wallet not configured (SPONSOR_ACCOUNT_ID + SPONSOR_PRIVATE_KEY(_FILE))');
  }
}

type SponsorKeyFile = { account_id?: string; private_key?: string };

/** Whatever Account.signAndSendTransaction resolves to in near-api-js 7.4. */
type SponsorTxOutcome = Awaited<ReturnType<Account['signAndSendTransaction']>>;

/**
 * The sponsor wallet — the ONLY place this service signs or sends NEAR
 * transactions, and only for two operations:
 *
 *  1. creating a NEAR Auth account (CreateAccount + AddKey + seed transfer),
 *  2. relaying the `sign` call on the fast-auth contract so MPC signatures
 *     cost the platform, not the farmer.
 *
 * Everything else in the API stays read-only (see backend/AGENTS.md).
 */
@Injectable()
export class SponsorSignerService {
  private readonly logger = new Logger(SponsorSignerService.name);
  private readonly account: Account | null = null;

  constructor(config: AppConfig, rpc: NearRpcService) {
    const accountId = config.get('SPONSOR_ACCOUNT_ID');
    const inlineKey = config.get('SPONSOR_PRIVATE_KEY');
    const keyFile = config.get('SPONSOR_PRIVATE_KEY_FILE');
    let secret: string | null = inlineKey ?? null;
    if (!secret && keyFile) {
      const parsed = JSON.parse(readFileSync(keyFile, 'utf8')) as SponsorKeyFile;
      secret = parsed.private_key ?? null;
      if (accountId && parsed.account_id && parsed.account_id !== accountId) {
        throw new Error(
          `SPONSOR_PRIVATE_KEY_FILE holds a key for ${parsed.account_id}, env says ${accountId}`,
        );
      }
    }
    if (!accountId || !secret) {
      this.logger.warn(
        'Sponsor wallet not configured — POST /fastauth/* returns 503 sponsor_unconfigured. ' +
          'Set SPONSOR_ACCOUNT_ID + SPONSOR_PRIVATE_KEY (or SPONSOR_PRIVATE_KEY_FILE).',
      );
      return;
    }
    const signer = new KeyPairSigner(KeyPair.fromString(secret as KeyPairString));
    this.account = new Account(accountId, rpc.provider, signer);
  }

  get configured(): boolean {
    return this.account !== null;
  }

  get sponsorAccountId(): string | null {
    return this.account?.accountId ?? null;
  }

  private require(): Account {
    if (!this.account) throw new SponsorNotConfiguredError();
    return this.account;
  }

  /** Creates a fresh NEAR Auth account with a full-access MPC key and a gas seed. */
  async createSponsoredAccount(
    accountId: string,
    publicKey: string,
    seedNear: string,
  ): Promise<SponsorTxOutcome> {
    return this.require().signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actions.createAccount(),
        actions.addFullAccessKey(PublicKey.fromString(publicKey)),
        actions.transfer(nearToYocto(seedNear as `${number}`)),
      ],
    });
  }

  /**
   * Relays the NEAR Auth relayer-protocol `sign` call: the fast-auth contract
   * verifies the Auth0 JWT through its guard, the MPC network signs, and the
   * base64 signature comes back as the call's SuccessValue. The sponsor pays
   * the gas.
   */
  async relaySign(args: {
    contractId: string;
    guardId: string;
    verifyPayload: string;
    signPayload: string | number[];
    algorithm: string;
  }): Promise<SponsorTxOutcome> {
    return this.require().signAndSendTransaction({
      receiverId: args.contractId,
      actions: [
        actions.functionCall(
          'sign',
          {
            guard_id: args.guardId,
            verify_payload: args.verifyPayload,
            sign_payload: args.signPayload,
            algorithm: args.algorithm,
          },
          300_000_000_000_000n, // 300 Tgas — matches the SDK's createSignAction default
          0n,
        ),
      ],
    });
  }
}
