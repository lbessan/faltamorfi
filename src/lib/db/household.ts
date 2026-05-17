import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Household } from "@/lib/database.types";

/**
 * Devuelve el hogar "activo" del usuario actual. En Fase 1 cada usuario tiene
 * un solo hogar (creado por el trigger handle_new_user). Más adelante, cuando
 * el usuario pueda pertenecer a varios hogares, esto se vuelve un selector.
 */
export async function getCurrentHousehold(
  supabase: SupabaseClient<Database>,
): Promise<Household | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("households(*)")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.households as Household | null) ?? null;
}

export async function requireCurrentHousehold(
  supabase: SupabaseClient<Database>,
): Promise<Household> {
  const household = await getCurrentHousehold(supabase);
  if (!household) {
    throw new Error(
      "No se encontró un hogar para el usuario. Esto suele indicar que el trigger de onboarding no corrió — revisá que el SQL del schema esté aplicado.",
    );
  }
  return household;
}
