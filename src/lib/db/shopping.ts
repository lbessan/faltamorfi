import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  InsertTable,
  ShoppingListItem,
  UpdateTable,
} from "@/lib/database.types";

export type ShoppingListItemWithProduct = ShoppingListItem & {
  product: {
    id: string;
    name: string;
    icon: string | null;
    department: string | null;
    unit: string;
  } | null;
};

export async function listShoppingItems(
  supabase: SupabaseClient<Database>,
  householdId: string,
  states: ShoppingListItem["state"][] = ["pending", "checked"],
): Promise<ShoppingListItemWithProduct[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(
      "*, product:products(id, name, icon, department, unit)",
    )
    .eq("household_id", householdId)
    .in("state", states)
    .order("added_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ShoppingListItemWithProduct[];
}

export async function insertShoppingItem(
  supabase: SupabaseClient<Database>,
  values: InsertTable<"shopping_list_items">,
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert(values)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateShoppingItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
  patch: UpdateTable<"shopping_list_items">,
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(patch)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteShoppingItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

/**
 * Cierra el viaje: convierte todos los items 'checked' del hogar en lotes
 * nuevos de su producto correspondiente, y los marca como 'completed'.
 * Items custom (sin product_id) se mantienen en estado 'checked' — la UI los
 * lista para que el user decida.
 *
 * Devuelve la cantidad de items procesados.
 */
export async function closeShoppingTrip(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("close_shopping_trip", {
    target_household_id: householdId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Suma cantidad si ya hay un item pending para el mismo product_id. Si no,
 * lo crea. Devuelve el item resultante.
 */
export async function addOrIncrementForProduct(
  supabase: SupabaseClient<Database>,
  params: {
    householdId: string;
    productId: string;
    quantity: number;
    unit: string;
    source: ShoppingListItem["source"];
    userId: string | null;
  },
): Promise<ShoppingListItem> {
  const { householdId, productId, quantity, unit, source, userId } = params;

  const { data: existing, error: fetchError } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("household_id", householdId)
    .eq("product_id", productId)
    .eq("state", "pending")
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    return updateShoppingItem(supabase, existing.id, {
      quantity: Number(existing.quantity) + quantity,
    });
  }

  return insertShoppingItem(supabase, {
    household_id: householdId,
    product_id: productId,
    quantity,
    unit,
    source,
    added_by: userId,
  });
}
