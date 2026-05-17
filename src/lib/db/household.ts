import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Household,
  HouseholdRole,
} from "@/lib/database.types";

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

/**
 * Devuelve el rol del usuario actual en un hogar. null si no es miembro.
 */
export async function getCurrentHouseholdRole(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<HouseholdRole | null> {
  const { data, error } = await supabase.rpc("get_household_role", {
    target_household_id: householdId,
  });
  if (error) throw error;
  const role = typeof data === "string" ? data : null;
  if (role === "owner" || role === "member" || role === "viewer") {
    return role;
  }
  return null;
}

export type HouseholdMemberWithEmail = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  email: string | null;
};

/**
 * Lista los miembros del hogar con su email (best-effort).
 *
 * Importante: auth.users no es accesible directamente con anon. Para mostrar
 * el email necesitamos un servicio account o una view pública. Para Fase 5a
 * devolvemos solo el email del user actual (que sí podemos resolver) y los
 * demás aparecen como "Miembro (sin email)" — lo arreglamos en una iteración
 * con una vista `public_user_emails` que el owner pueda consultar.
 */
export async function listHouseholdMembers(
  supabase: SupabaseClient<Database>,
  householdId: string,
  currentUserId: string,
  currentUserEmail: string | null,
): Promise<HouseholdMemberWithEmail[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, user_id, role, joined_at")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((m) => ({
    household_id: m.household_id,
    user_id: m.user_id,
    role: m.role as HouseholdRole,
    joined_at: m.joined_at,
    email: m.user_id === currentUserId ? currentUserEmail : null,
  }));
}

export async function updateHouseholdName(
  supabase: SupabaseClient<Database>,
  householdId: string,
  name: string,
): Promise<Household> {
  const { data, error } = await supabase
    .from("households")
    .update({ name })
    .eq("id", householdId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setMemberRole(
  supabase: SupabaseClient<Database>,
  householdId: string,
  userId: string,
  role: HouseholdRole,
): Promise<void> {
  const { error } = await supabase
    .from("household_members")
    .update({ role })
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(
  supabase: SupabaseClient<Database>,
  householdId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) throw error;
}
