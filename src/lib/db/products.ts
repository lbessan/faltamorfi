import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  InsertTable,
  Product,
  UpdateTable,
} from "@/lib/database.types";

export type LotSummary = {
  id: string;
  quantity: number;
  expires_on: string | null;
  frozen_at: string | null;
  frozen_max_days: number | null;
  brand: string | null;
  barcode: string | null;
  image_url: string | null;
};

export type ProductWithLocation = Product & {
  location: { id: string; name: string; icon: string | null } | null;
  lots: LotSummary[];
};

const PRODUCT_SELECT = `
  *,
  location:locations!products_default_location_id_fkey(id, name, icon),
  lots:stock_items(id, quantity, expires_on, frozen_at, frozen_max_days, brand, barcode, image_url)
`;

export async function listProducts(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<ProductWithLocation[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("household_id", householdId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProductWithLocation[];
}

export async function getProduct(
  supabase: SupabaseClient<Database>,
  productId: string,
): Promise<ProductWithLocation | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProductWithLocation | null) ?? null;
}

export async function insertProduct(
  supabase: SupabaseClient<Database>,
  values: InsertTable<"products">,
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .insert(values)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProduct(
  supabase: SupabaseClient<Database>,
  productId: string,
  patch: UpdateTable<"products">,
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProduct(
  supabase: SupabaseClient<Database>,
  productId: string,
): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) throw error;
}

/**
 * Busca productos por código de barras en sus lotes. Devuelve el primero
 * que matchee (un mismo barcode puede aparecer en varios lotes — son del
 * mismo SKU, todos apuntan al mismo producto tipo).
 */
export async function findProductByBarcode(
  supabase: SupabaseClient<Database>,
  householdId: string,
  barcode: string,
): Promise<ProductWithLocation | null> {
  const { data: items, error } = await supabase
    .from("stock_items")
    .select("product_id, products!inner(household_id)")
    .eq("barcode", barcode)
    .eq("products.household_id", householdId)
    .limit(1);

  if (error) throw error;
  if (!items?.length) return null;

  return getProduct(supabase, items[0].product_id);
}
