import Link from "next/link";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import { T } from "@/components/i18n/t";
import { Button } from "@/components/ui/button";

/** Two audiences, one record — a diptych divided by a hairline, not two cards. */
export function Audiences() {
  return (
    <section aria-labelledby="for-title" className="page-max page-x py-16 md:py-24">
      <h2 id="for-title" className="text-h2 max-w-xl">
        <T k="landing.forTitle" />
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
        <article className="flex flex-col items-start gap-4 md:pr-10">
          <h3 className="text-2xl">
            <span className="mark-lime">
              <T k="landing.farmerTitle" />
            </span>
          </h3>
          <p className="measure text-ink-2">
            <T k="landing.farmerBody" />
          </p>
          <Button asChild variant="outline">
            <Link href="/onboarding">
              <T k="landing.farmerCta" />
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </article>
        <article className="flex flex-col items-start gap-4 border-t border-border pt-10 md:border-t-0 md:pt-0 md:pl-10">
          <h3 className="text-2xl">
            <T k="landing.buyerTitle" />
          </h3>
          <p className="measure text-ink-2">
            <T k="landing.buyerBody" />
          </p>
          <Button asChild variant="outline">
            <Link href="/market">
              <T k="landing.buyerCta" />
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </article>
      </div>
    </section>
  );
}
