import { Suspense } from "react";

import { CheckoutView } from "@/app/checkout/[id]/_components/checkout-view";
import { Skeleton } from "@/components/ui/skeleton";
import { createMetadata } from "@/lib/seo";

import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/checkout/[id]">): Promise<Metadata> {
  const { id } = await params;
  return createMetadata({ title: `Danai ${decodeURIComponent(id)}`, path: `/checkout/${id}`, noIndex: true });
}

async function CheckoutFromParams({ params }: { params: PageProps<"/checkout/[id]">["params"] }) {
  const { id } = await params;
  return <CheckoutView lotId={decodeURIComponent(id)} />;
}

export default function CheckoutPage({ params }: PageProps<"/checkout/[id]">) {
  return (
    <Suspense fallback={<div className="page-max page-x py-12"><Skeleton className="h-96 w-full" /></div>}>
      <CheckoutFromParams params={params} />
    </Suspense>
  );
}
