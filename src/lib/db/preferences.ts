import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  UpdateTable,
  UserPreferences,
} from "@/lib/database.types";

const DEFAULT_PREFS: Omit<UserPreferences, "user_id" | "updated_at"> = {
  default_expiry_warning_days: 3,
  notifications_enabled: false,
  push_subscription: null,
};

/**
 * Devuelve las preferencias del usuario. Si todavía no existe row, la crea
 * con los defaults y la devuelve.
 */
export async function getOrCreateUserPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from("user_preferences")
    .insert({ user_id: userId, ...DEFAULT_PREFS })
    .select()
    .single();

  if (insertError) throw insertError;
  return inserted;
}

export async function updateUserPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
  patch: UpdateTable<"user_preferences">,
): Promise<UserPreferences> {
  // upsert para crear la row si todavía no existe
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
