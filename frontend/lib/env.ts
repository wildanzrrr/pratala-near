/**
 * Validated public environment. Every NEXT_PUBLIC_* value is referenced
 * literally so Next can inline it at build time; validation runs once at
 * module load and falls back to the documented testnet defaults
 * (docs/INTERFACES.md §1) instead of crashing the page.
 */
import { z } from "zod";

const schema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  rpcUrl: z.url(),
  lotsContractId: z.string().min(2),
  pusdcContractId: z.string().min(2),
  apiUrl: z.url(),
  explorerBase: z.url(),
  authRecipient: z.string().min(2),
  demoIdrRate: z.coerce.number().positive(),
  siteUrl: z.url(),
  demoFixtures: z.boolean(),
  fastauthClientId: z.string(),
  fastauthContractId: z.string().min(2),
  fastauthMpcContractId: z.string().min(2),
  fastauthDomain: z.string().min(4),
  fastauthApiAudience: z.string().min(4),
  ssoAccountRoot: z.string().min(2),
});

export type PublicEnv = z.infer<typeof schema>;

const raw = {
  network: process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://test.rpc.fastnear.com",
  lotsContractId: process.env.NEXT_PUBLIC_LOTS_CONTRACT_ID ?? "lots.pratala.testnet",
  pusdcContractId: process.env.NEXT_PUBLIC_PUSDC_CONTRACT_ID ?? "pusdc.pratala.testnet",
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api").replace(/\/$/, ""),
  explorerBase: (process.env.NEXT_PUBLIC_EXPLORER_BASE ?? "https://testnet.nearblocks.io").replace(/\/$/, ""),
  authRecipient: process.env.NEXT_PUBLIC_AUTH_RECIPIENT ?? "lots.pratala.testnet",
  demoIdrRate: process.env.NEXT_PUBLIC_DEMO_IDR_RATE ?? "18000",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  demoFixtures: process.env.NEXT_PUBLIC_DEMO_FIXTURES === "1",
  // NEAR Auth email SSO (docs.auth.near.org) — shared testnet deployment by default.
  fastauthClientId: process.env.NEXT_PUBLIC_FASTAUTH_CLIENT_ID ?? "np8paqIpMWmNbzT4xAvOOapZBjsOpptl",
  fastauthContractId: process.env.NEXT_PUBLIC_FASTAUTH_CONTRACT_ID ?? "fast-auth.testnet",
  fastauthMpcContractId: process.env.NEXT_PUBLIC_FASTAUTH_MPC_CONTRACT_ID ?? "v1.signer-prod.testnet",
  fastauthDomain: process.env.NEXT_PUBLIC_FASTAUTH_AUTH0_DOMAIN ?? "login.testnet.fast-auth.com",
  fastauthApiAudience: process.env.NEXT_PUBLIC_FASTAUTH_API_AUDIENCE ?? "https://api.testnet.fast-auth.com",
  // NEAR testnet rule: CreateAccount only works for the signer's own subaccounts,
  // so SSO ids live under the sponsor wallet itself.
  ssoAccountRoot: process.env.NEXT_PUBLIC_SSO_ACCOUNT_ROOT ?? "sponsor.pratala.testnet",
};

const parsed = schema.safeParse(raw);

/**
 * Mainnet must never run on testnet values. On mainnet, a missing var would
 * otherwise fall back to its testnet default and silently mix networks (e.g. a
 * mainnet app talking to a testnet contract). Fail loudly instead.
 */
function assertNoTestnetMix(e: PublicEnv): void {
  const vars: Record<string, string> = {
    rpcUrl: e.rpcUrl,
    lotsContractId: e.lotsContractId,
    pusdcContractId: e.pusdcContractId,
    explorerBase: e.explorerBase,
    authRecipient: e.authRecipient,
    fastauthContractId: e.fastauthContractId,
    fastauthMpcContractId: e.fastauthMpcContractId,
    fastauthDomain: e.fastauthDomain,
    fastauthApiAudience: e.fastauthApiAudience,
    ssoAccountRoot: e.ssoAccountRoot,
  };
  const offenders = Object.entries(vars)
    .filter(([, v]) => v.includes("testnet"))
    .map(([k]) => `NEXT_PUBLIC_* ${k}`);
  if (offenders.length > 0) {
    throw new Error(
      `[pratala] network=mainnet but testnet values in use: ${offenders.join(", ")} — set every NEXT_PUBLIC_* var explicitly in frontend/.env.local`,
    );
  }
}

if (!parsed.success && raw.network === "mainnet") {
  throw new Error(
    `[pratala] invalid public env on mainnet: ${JSON.stringify(z.treeifyError(parsed.error))} — fix frontend/.env.local`,
  );
}

if (!parsed.success) {
  console.warn("[pratala] invalid public env, using defaults where possible", z.treeifyError(parsed.error));
}

export const env: PublicEnv = parsed.success
  ? parsed.data
  : {
      network: "testnet",
      rpcUrl: "https://test.rpc.fastnear.com",
      lotsContractId: "lots.pratala.testnet",
      pusdcContractId: "pusdc.pratala.testnet",
      apiUrl: "http://localhost:4100/api",
      explorerBase: "https://testnet.nearblocks.io",
      authRecipient: "lots.pratala.testnet",
      demoIdrRate: 18000,
      siteUrl: "http://localhost:3000",
      demoFixtures: raw.demoFixtures,
      fastauthClientId: raw.fastauthClientId,
      fastauthContractId: raw.fastauthContractId,
      fastauthMpcContractId: raw.fastauthMpcContractId,
      fastauthDomain: raw.fastauthDomain,
      fastauthApiAudience: raw.fastauthApiAudience,
      ssoAccountRoot: raw.ssoAccountRoot,
    };

assertNoTestnetMix(env);

/** True when running against NEAR testnet (demo faucet, demo copy). */
export const isTestnet = env.network === "testnet";
