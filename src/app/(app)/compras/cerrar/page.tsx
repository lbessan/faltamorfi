import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listShoppingItems } from "@/lib/db/shopping";
import { CloseTripView } from "./_components/close-trip-view";

export const metadata: Metadata = {
  title: "Volví a casa",
};

export default async function CerrarPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const items = await listShoppingItems(supabase, household.id, ["checked"]);

  if (items.length === 0) {
    redirect("/compras");
  }

  return <CloseTripView householdId={household.id} items={items} />;
}
