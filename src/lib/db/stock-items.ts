import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  InsertTable,
  StockItem,
  UpdateTable,
} from "@/lib/database.types";

export type StockItemWithLocation = StockItem & {
  location: { id: string; name: string; kind: string } | null;
};

export async function listStockItems(
  supabase: SupabaseClient<Database>,
  productId: string,
): Promise<StockItemWithLocation[]> {
  const { data, error } = await supabase
    .from("stock_items")
    .select("*, location:locations(id, name, kind)")
    .eq("product_id", productId)
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StockItemWithLocation[];
}

export async function insertStockItem(
  supabase: SupabaseClient<Database>,
  values: InsertTable<"stock_items">,
): Promise<StockItem> {
  const { data, error } = await supabase
    .from("stock_items")
    .insert(values)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateStockItem(
  supabase: SupabaseClient<Database>,
  stockItemId: string,
  patch: UpdateTable<"stock_items">,
): Promise<StockItem> {
  const { data, error } = await supabase
    .from("stock_items")
    .update(patch)
    .eq("id", stockItemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteStockItem(
  supabase: SupabaseClient<Database>,
  stockItemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("stock_items")
    .delete()
    .eq("id", stockItemId);

  if (error) throw error;
}

/**
 * Descuenta `amount` del producto siguiendo FIFO por fecha de vencimiento
 * (más próximo primero, los sin vencimiento al final).
 *
 * Usa el RPC `consume_from_lots` en Postgres → atómico.
 *
 * Devuelve la cantidad efectivamente descontada (puede ser < amount si no
 * había suficiente stock).
 */
export async function consumeFromLots(
  supabase: SupabaseClient<Database>,
  productId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("consume_from_lots", {
    target_product_id: productId,
    amount,
  });

  if (error) throw error;
  return Number(data ?? 0);
}
