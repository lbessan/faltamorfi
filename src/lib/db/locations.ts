import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Location } from "@/lib/database.types";

export async function listLocations(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<Location[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
