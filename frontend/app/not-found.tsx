import Link from "next/link";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { T } from "@/components/i18n/t";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-max page-x flex flex-1 flex-col items-start justify-center gap-4 py-24">
      <MagnifyingGlass aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-4xl">
        <T k="states.notFoundTitle" />
      </h1>
      <p className="text-ink-2">
        <T k="states.notFoundBody" />
      </p>
      <Button asChild>
        <Link href="/">
          <T k="states.home" />
        </Link>
      </Button>
    </div>
  );
}
