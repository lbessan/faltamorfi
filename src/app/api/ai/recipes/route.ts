import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listProducts } from "@/lib/db/products";
import {
  suggestRecipes,
  type StockItemForRecipes,
} from "@/lib/ai/suggest-recipes";
import { effectiveExpiry } from "@/lib/expiry";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const household = await requireCurrentHousehold(supabase);
    const products = await listProducts(supabase, household.id);

    // Solo productos activos con stock > 0. Convertimos al shape que espera
    // el helper, con days_until_expiry calculado para cada lote.
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const stock: StockItemForRecipes[] = products
      .filter((p) => p.is_active && Number(p.quantity) > 0)
      .map((p) => ({
        product_name: p.name,
        department: p.department,
        quantity: Number(p.quantity),
        unit: p.unit,
        lots: p.lots
          .filter((l) => Number(l.quantity) > 0)
          .map((l) => {
            const exp = effectiveExpiry(l);
            const days = exp
              ? Math.floor((exp.getTime() - now.getTime()) / dayMs)
              : null;
            return {
              quantity: Number(l.quantity),
              variant: l.variant,
              brand: l.brand,
              days_until_expiry: days,
              state: (l.frozen_at
                ? "frozen"
                : l.opened_at
                  ? "opened"
                  : null) as "frozen" | "opened" | null,
            };
          })
          // Ordenamos por urgencia: lotes que vencen antes primero.
          .sort((a, b) => {
            if (a.days_until_expiry === null && b.days_until_expiry === null) {
              return 0;
            }
            if (a.days_until_expiry === null) return 1;
            if (b.days_until_expiry === null) return -1;
            return a.days_until_expiry - b.days_until_expiry;
          }),
      }));

    const result = await suggestRecipes(stock);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/recipes]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error inesperado.",
      },
      { status: 500 },
    );
  }
}
