import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { listProducts } from "@/lib/db/products";
import { InventoryView } from "./_components/inventory-view";

export const metadata: Metadata = {
  title: "Inventario",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);

  const [locations, products] = await Promise.all([
    listLocations(supabase, household.id),
    listProducts(supabase, household.id),
  ]);

  return (
    <InventoryView
      householdName={household.name}
      locations={locations}
      products={products}
    />
  );
}
