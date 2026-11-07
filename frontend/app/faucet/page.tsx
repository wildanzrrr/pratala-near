import { FaucetView } from "@/app/faucet/_components/faucet-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "pUSDC uji coba",
  description: "Ambil 1.000 pUSDC uji di testnet NEAR untuk mencoba mendanai lot panen di Pratala. Token tanpa nilai.",
  path: "/faucet",
});

export default function FaucetPage() {
  return <FaucetView />;
}
