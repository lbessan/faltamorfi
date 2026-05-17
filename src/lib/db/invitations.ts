import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, HouseholdInvitation } from "@/lib/database.types";

/**
 * Genera un token URL-safe largo (256 bits) y un código corto de 8 caracteres
 * sin ambigüedad visual (sin 0/O, 1/I/L, etc).
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateInvitationCredentials(): {
  token: string;
  code: string;
} {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  // URL-safe base64
  const token = Buffer.from(tokenBytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const codeBytes = new Uint8Array(8);
  crypto.getRandomValues(codeBytes);
  let code = "";
  for (const b of codeBytes) {
    code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }

  return { token, code };
}

export async function listActiveInvitations(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<HouseholdInvitation[]> {
  const { data, error } = await supabase
    .from("household_invitations")
    .select("*")
    .eq("household_id", householdId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function insertInvitation(
  supabase: SupabaseClient<Database>,
  values: {
    household_id: string;
    role: "member" | "viewer";
    created_by: string | null;
    token: string;
    code: string;
  },
): Promise<HouseholdInvitation> {
  const { data, error } = await supabase
    .from("household_invitations")
    .insert(values)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInvitation(
  supabase: SupabaseClient<Database>,
  invitationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", invitationId);
  if (error) throw error;
}

/**
 * Acepta una invitación por token o por código. Devuelve { household_id, role }
 * o lanza error si la invitación es inválida/vencida.
 */
export async function acceptInvitation(
  supabase: SupabaseClient<Database>,
  lookup: string,
): Promise<{ household_id: string; role: string }> {
  const { data, error } = await supabase.rpc("accept_household_invitation", {
    invitation_lookup: lookup,
  });

  if (error) throw error;

  // El RPC devuelve `setof (uuid, text)` que Supabase tipa como array.
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("La invitación no es válida.");
  }
  return row;
}
