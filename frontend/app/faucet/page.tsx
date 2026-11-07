import { FaucetView } from "@/app/faucet/_components/faucet-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Test pUSDC",
  description: "Get 1,000 test pUSDC on NEAR testnet to try funding a harvest lot on Pratala. The token has no value.",
  path: "/faucet",
});

export default function FaucetPage() {
  return <FaucetView />;
}
