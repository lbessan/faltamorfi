import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  InsertTable,
  Product,
  UpdateTable,
} from "@/lib/database.types";

export type ProductWithLocation = Product & {
  location: { id: string; name: string; icon: string | null } | null;
};

export async function listProducts(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<ProductWithLocation[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*, location:locations!products_default_location_id_fkey(id, name, icon)")
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
    .select("*, location:locations!products_default_location_id_fkey(id, name, icon)")
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
