import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { listProducts } from "@/lib/db/products";
import { getOrCreateUserPreferences } from "@/lib/db/preferences";
import { canEdit } from "@/lib/database.types";
import { InventoryView } from "./_components/inventory-view";

export const metadata: Metadata = {
  title: "Inventario",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [locations, products, prefs, role] = await Promise.all([
    listLocations(supabase, household.id),
    listProducts(supabase, household.id),
    user ? getOrCreateUserPreferences(supabase, user.id) : Promise.resolve(null),
    getCurrentHouseholdRole(supabase, household.id),
  ]);

  return (
    <InventoryView
      householdName={household.name}
      locations={locations}
      products={products}
      warningDays={prefs?.default_expiry_warning_days ?? 3}
      canEdit={canEdit(role)}
    />
  );
}
