import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Registra un consumo: descuenta del stock del producto e inserta un log.
 *
 * No es atómico (en Fase 5 lo movemos a una función RPC en Postgres), pero
 * para Fase 1 con un único usuario activo es suficiente. La cantidad puede
 * ser negativa (devolución / ajuste positivo).
 */
export async function consumeProduct(
  supabase: SupabaseClient<Database>,
  params: {
    productId: string;
    quantity: number;
    userId: string | null;
    note?: string;
  },
): Promise<void> {
  const { productId, quantity, userId, note } = params;

  const { data: current, error: fetchError } = await supabase
    .from("products")
    .select("quantity")
    .eq("id", productId)
    .single();

  if (fetchError) throw fetchError;

  const newQuantity = Math.max(0, Number(current.quantity) - quantity);

  const { error: updateError } = await supabase
    .from("products")
    .update({ quantity: newQuantity })
    .eq("id", productId);

  if (updateError) throw updateError;

  const { error: logError } = await supabase.from("consumption_log").insert({
    product_id: productId,
    quantity,
    user_id: userId,
    note: note ?? null,
  });

  if (logError) throw logError;
}
