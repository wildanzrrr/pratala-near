import Image from "next/image";
import Link from "next/link";

import { ArrowRight, Plant } from "@phosphor-icons/react/dist/ssr";

import { T } from "@/components/i18n/t";
import { Button } from "@/components/ui/button";

import heroPhoto from "@/public/images/rice-field.jpg";

/** H2 · split diptych 7/5 — claim on the left, the field itself on the right. */
export function Hero() {
  return (
    <section className="page-max page-x grid grid-cols-1 items-center gap-10 pt-10 pb-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-14 md:pt-16 md:pb-20">
      <div className="reveal flex min-w-0 flex-col gap-6" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="text-display max-w-[14ch] text-foreground">
          <T k="landing.heroTitle" />
        </h1>
        <p className="measure text-lg leading-relaxed text-ink-2">
          <T k="landing.heroLead" />
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/market">
              <T k="landing.ctaBrowse" />
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/farmer/new">
              <Plant data-icon="inline-start" />
              <T k="landing.ctaRegister" />
            </Link>
          </Button>
        </div>
      </div>
      <figure className="reveal m-0 flex min-w-0 flex-col gap-2" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="overflow-hidden rounded-md border border-border">
          <Image
            src={heroPhoto}
            alt="Petani menanam padi di sawah tergenang di Indonesia"
            priority
            sizes="(min-width: 60rem) 30rem, 100vw"
            className="aspect-[4/5] h-auto w-full object-cover md:aspect-[4/5]"
            placeholder="blur"
          />
        </div>
        <figcaption className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <T k="landing.photoTitle" />
          </span>
          <span>
            <a
              href="https://unsplash.com/photos/a-group-of-people-working-in-a-rice-field-73H3_OSyWOM"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              <T k="landing.photoCredit" />
            </a>
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
