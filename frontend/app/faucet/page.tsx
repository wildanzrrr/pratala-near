import { redirect } from "next/navigation";

import { FaucetView } from "@/app/faucet/_components/faucet-view";
import { createMetadata } from "@/lib/seo";
import { isTestnet } from "@/lib/env";

export const metadata = createMetadata({
  title: "Test pUSDC",
  description: "Get 1,000 test pUSDC on NEAR testnet to try funding a harvest lot on Pratala. The token has no value.",
  path: "/faucet",
});

/** Demo faucet — testnet only. On mainnet the escrow token is real USDC; there is nothing to drip. */
export default function FaucetPage() {
  if (!isTestnet) redirect("/market");
  return <FaucetView />;
}
