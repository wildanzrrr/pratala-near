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
  demoIdrRate: process.env.NEXT_PUBLIC_DEMO_IDR_RATE ?? "16000",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  demoFixtures: process.env.NEXT_PUBLIC_DEMO_FIXTURES === "1",
};

const parsed = schema.safeParse(raw);

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
      demoIdrRate: 16000,
      siteUrl: "http://localhost:3000",
      demoFixtures: raw.demoFixtures,
    };
