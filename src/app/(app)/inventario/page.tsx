import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listProducts } from "@/lib/db/products";
import { getOrCreateUserPreferences } from "@/lib/db/preferences";
import { fetchConsumptionRates } from "@/lib/db/predictions";
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

  const [products, prefs, role, rates] = await Promise.all([
    listProducts(supabase, household.id),
    user ? getOrCreateUserPreferences(supabase, user.id) : Promise.resolve(null),
    getCurrentHouseholdRole(supabase, household.id),
    fetchConsumptionRates(supabase, household.id),
  ]);

  // Serializamos el Map para que sea client-prop-safe (Server → Client RSC).
  const ratesByProduct = Object.fromEntries(rates);

  return (
    <InventoryView
      householdId={household.id}
      householdName={household.name}
      products={products}
      warningDays={prefs?.default_expiry_warning_days ?? 3}
      canEdit={canEdit(role)}
      ratesByProduct={ratesByProduct}
    />
  );
}
