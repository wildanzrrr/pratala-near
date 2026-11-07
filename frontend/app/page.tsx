import { Audiences } from "@/app/_components/audiences";
import { Hero } from "@/app/_components/hero";
import { LiveStats } from "@/app/_components/live-stats";
import { Notes } from "@/app/_components/notes";
import { SettlementExample } from "@/app/_components/settlement-example";
import { Stages } from "@/app/_components/stages";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ path: "/" });

/** Landing · Hallmark Narrative Workflow: hero → live chain stats → five stages → worked math → audiences → notes. */
export default function HomePage() {
  return (
    <>
      <Hero />
      <LiveStats />
      <Stages />
      <SettlementExample />
      <Audiences />
      <Notes />
    </>
  );
}
