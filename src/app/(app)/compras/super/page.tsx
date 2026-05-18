import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listShoppingItems } from "@/lib/db/shopping";
import { SuperView } from "./_components/super-view";

export const metadata: Metadata = {
  title: "Modo super",
};

export default async function SuperPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const items = await listShoppingItems(supabase, household.id, [
    "pending",
    "checked",
  ]);

  if (items.length === 0) {
    redirect("/compras");
  }

  return <SuperView householdId={household.id} items={items} />;
}
