import Link from "next/link";

import { cn } from "@/lib/utils";

/** The pratala wordmark: a set-in-type mark, not a logo image. */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} aria-label="Pratala" className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-[0.6rem_0.6rem_0.6rem_0.2rem] bg-primary font-heading text-lg leading-none text-primary-foreground"
      >
        P
      </span>
      <span className="font-heading text-[1.35rem] leading-none font-medium tracking-[-0.03em] text-foreground max-[359px]:sr-only">pratala</span>
    </Link>
  );
}
