import { Suspense } from "react";

import { ReceiptView } from "@/app/receipt/[txHash]/_components/receipt-view";
import { Skeleton } from "@/components/ui/skeleton";
import { createMetadata } from "@/lib/seo";

import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/receipt/[txHash]">): Promise<Metadata> {
  const { txHash } = await params;
  return createMetadata({ title: `Receipt ${txHash.slice(0, 8)}…`, path: `/receipt/${txHash}`, noIndex: true });
}

async function ReceiptFromRequest({ params, searchParams }: PageProps<"/receipt/[txHash]">) {
  const [{ txHash }, sp] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <ReceiptView txHash={txHash} signer={one(sp.signer)} lotId={one(sp.lot)} />;
}

/** Printable receipt for any Pratala transaction. */
export default function ReceiptPage(props: PageProps<"/receipt/[txHash]">) {
  return (
    <Suspense fallback={<div className="page-max page-x py-12"><Skeleton className="h-96 w-full max-w-2xl" /></div>}>
      <ReceiptFromRequest {...props} />
    </Suspense>
  );
}
