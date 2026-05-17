import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { listProducts } from "@/lib/db/products";
import { RestockView } from "./_components/restock-view";

export const metadata: Metadata = {
  title: "Por reponer",
};

export default async function ListaPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const [locations, products] = await Promise.all([
    listLocations(supabase, household.id),
    listProducts(supabase, household.id),
  ]);

  // "Por reponer" = activos sin stock (quantity = 0)
  // y los que están bajo umbral (con poco stock) también podrían entrar acá,
  // pero los priorizamos abajo en la misma lista.
  const restock = products.filter(
    (p) => p.is_active && Number(p.quantity) <= 0,
  );
  const lowStock = products.filter(
    (p) =>
      p.is_active &&
      Number(p.quantity) > 0 &&
      Number(p.quantity) <= Number(p.low_stock_threshold),
  );

  return (
    <RestockView
      restock={restock}
      lowStock={lowStock}
      locations={locations}
    />
  );
}
