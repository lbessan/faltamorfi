import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { listProducts } from "@/lib/db/products";
import { listShoppingItems } from "@/lib/db/shopping";
import { fetchConsumptionRates, predictDaysLeft } from "@/lib/db/predictions";
import { canEdit } from "@/lib/database.types";
import { ComprasView } from "./_components/compras-view";

export const metadata: Metadata = {
  title: "Compras",
};

const RUNNING_OUT_DAYS = 7;

export default async function ComprasPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const [locations, products, shoppingItems, role, rates] = await Promise.all([
    listLocations(supabase, household.id),
    listProducts(supabase, household.id),
    listShoppingItems(supabase, household.id, ["pending", "checked"]),
    getCurrentHouseholdRole(supabase, household.id),
    fetchConsumptionRates(supabase, household.id),
  ]);

  const restock = products.filter(
    (p) => p.is_active && Number(p.quantity) <= 0,
  );
  const lowStock = products.filter(
    (p) =>
      p.is_active &&
      Number(p.quantity) > 0 &&
      Number(p.quantity) <= Number(p.low_stock_threshold),
  );
  // Productos que NO están bajos por umbral pero la predicción dice que se
  // acaban en ≤ 7 días. Solo si la confianza es media o alta.
  const runningOut = products.filter((p) => {
    if (!p.is_active) return false;
    const qty = Number(p.quantity);
    if (qty <= Number(p.low_stock_threshold)) return false;
    const pred = predictDaysLeft(rates.get(p.id), qty);
    if (pred.confidence === "none" || pred.confidence === "low") return false;
    return (
      pred.daysLeft !== null &&
      pred.daysLeft > 0 &&
      pred.daysLeft <= RUNNING_OUT_DAYS
    );
  });

  const productsInList = new Set(
    shoppingItems
      .filter((s) => s.product_id !== null && s.state !== "completed")
      .map((s) => s.product_id as string),
  );

  const ratesByProduct = Object.fromEntries(rates);

  return (
    <ComprasView
      householdId={household.id}
      restock={restock}
      lowStock={lowStock}
      runningOut={runningOut}
      productsInList={productsInList}
      shoppingItems={shoppingItems}
      locations={locations}
      canEdit={canEdit(role)}
      ratesByProduct={ratesByProduct}
    />
  );
}
