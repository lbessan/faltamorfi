import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { consumeFromLots } from "@/lib/db/stock-items";

/**
 * Registra un consumo: descuenta del stock vía FIFO sobre lotes
 * (`consume_from_lots` RPC) e inserta el log para histórico/predicciones.
 *
 * - El descuento es atómico (lock + update por lote en una sola transacción
 *   server-side).
 * - `products.quantity` se actualiza automáticamente vía trigger.
 * - Si `quantity` es negativo o cero, no hacemos nada.
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

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return;
  }

  const consumed = await consumeFromLots(supabase, productId, quantity);

  if (consumed <= 0) return;

  const { error: logError } = await supabase.from("consumption_log").insert({
    product_id: productId,
    quantity: consumed,
    user_id: userId,
    note: note ?? null,
  });

  if (logError) throw logError;
}

