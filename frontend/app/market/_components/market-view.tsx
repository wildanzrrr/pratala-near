"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleBanner } from "@/components/common/sample-banner";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { InputsTab } from "@/app/market/_components/inputs-tab";
import { LotsTab } from "@/app/market/_components/lots-tab";
import { useT } from "@/providers/locale-provider";

export function MarketView() {
  const t = useT();
  return (
    <PageBody>
      <PageHeader title={t("market.title")} lead={t("market.lead")} />
      <SampleBanner />
      <Tabs defaultValue="lots" className="gap-6">
        <TabsList>
          <TabsTrigger value="lots">{t("market.tabLots")}</TabsTrigger>
          <TabsTrigger value="inputs">{t("market.tabInputs")}</TabsTrigger>
        </TabsList>
        <TabsContent value="lots">
          <LotsTab />
        </TabsContent>
        <TabsContent value="inputs">
          <InputsTab />
        </TabsContent>
      </Tabs>
    </PageBody>
  );
}
