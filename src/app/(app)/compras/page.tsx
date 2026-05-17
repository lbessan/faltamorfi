import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { listProducts } from "@/lib/db/products";
import { listShoppingItems } from "@/lib/db/shopping";
import { canEdit } from "@/lib/database.types";
import { ComprasView } from "./_components/compras-view";

export const metadata: Metadata = {
  title: "Compras",
};

export default async function ComprasPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const [locations, products, shoppingItems, role] = await Promise.all([
    listLocations(supabase, household.id),
    listProducts(supabase, household.id),
    listShoppingItems(supabase, household.id, ["pending", "checked"]),
    getCurrentHouseholdRole(supabase, household.id),
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

  // Set de product_ids que ya están en la lista (para mostrar el badge).
  const productsInList = new Set(
    shoppingItems
      .filter((s) => s.product_id !== null && s.state !== "completed")
      .map((s) => s.product_id as string),
  );

  return (
    <ComprasView
      restock={restock}
      lowStock={lowStock}
      productsInList={productsInList}
      shoppingItems={shoppingItems}
      locations={locations}
      canEdit={canEdit(role)}
    />
  );
}
