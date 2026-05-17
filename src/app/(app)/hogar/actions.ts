"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateUserPreferences } from "@/lib/db/preferences";
import {
  acceptInvitation,
  deleteInvitation,
  generateInvitationCredentials,
  insertInvitation,
} from "@/lib/db/invitations";
import {
  removeMember,
  requireCurrentHousehold,
  setMemberRole,
  updateHouseholdName,
} from "@/lib/db/household";
import type { HouseholdRole } from "@/lib/database.types";
import {
  parseSubscription,
  sendPush,
  type PushPayload,
} from "@/lib/notifications/push";

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

type AuthOk = {
  ok: true;
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
};
type AuthFail = { ok: false; message: string };

async function getUserOrError(): Promise<AuthOk | AuthFail> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "No autorizado." };
  }
  return { ok: true, supabase, user };
}

/**
 * Guarda la PushSubscription del navegador y activa las notificaciones.
 * `subscription` viene como `JSON.parse(subscription.toJSON())` desde el cliente.
 */
export async function subscribeToPushAction(
  subscriptionJson: unknown,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  const sub = parseSubscription(subscriptionJson);
  if (!sub) {
    return {
      status: "error",
      message: "La suscripción del navegador no es válida.",
    };
  }

  try {
    await updateUserPreferences(ctx.supabase, ctx.user.id, {
      push_subscription: sub as unknown as never, // jsonb
      notifications_enabled: true,
    });
    revalidatePath("/hogar");
    return { status: "success", message: "Notificaciones activadas." };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error guardando la suscripción.",
    };
  }
}

export async function unsubscribeFromPushAction(): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  try {
    await updateUserPreferences(ctx.supabase, ctx.user.id, {
      push_subscription: null,
      notifications_enabled: false,
    });
    revalidatePath("/hogar");
    return { status: "success", message: "Notificaciones desactivadas." };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function updateAlertDaysAction(
  days: number,
): Promise<ActionState> {
  if (!Number.isFinite(days) || days < 0 || days > 60) {
    return {
      status: "error",
      message: "Los días de aviso deben estar entre 0 y 60.",
    };
  }
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  try {
    await updateUserPreferences(ctx.supabase, ctx.user.id, {
      default_expiry_warning_days: Math.round(days),
    });
    revalidatePath("/hogar");
    revalidatePath("/inventario");
    return { status: "success" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function sendTestPushAction(): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  const { data, error: prefsError } = await ctx.supabase
    .from("user_preferences")
    .select("push_subscription, notifications_enabled")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (prefsError) {
    return { status: "error", message: prefsError.message };
  }
  if (!data?.notifications_enabled || !data.push_subscription) {
    return {
      status: "error",
      message: "Primero activá las notificaciones.",
    };
  }

  const sub = parseSubscription(data.push_subscription);
  if (!sub) {
    return { status: "error", message: "La suscripción guardada está corrupta." };
  }

  const payload: PushPayload = {
    title: "Falta Morfi",
    body: "Prueba de notificación: todo funciona 👍",
    url: "/inventario",
    tag: "test",
  };

  const result = await sendPush(sub, payload);
  if (!result.ok) {
    if (result.expired) {
      // Limpiamos la suscripción expirada
      await updateUserPreferences(ctx.supabase, ctx.user.id, {
        push_subscription: null,
        notifications_enabled: false,
      });
      return {
        status: "error",
        message:
          "La suscripción expiró. Volvé a activar las notificaciones desde el botón.",
      };
    }
    return { status: "error", message: result.reason };
  }

  return { status: "success", message: "Push enviado. Revisá tu dispositivo." };
}

// ============================================================================
// Hogar compartido — invitaciones, miembros, roles
// ============================================================================

export type InvitationCreated = {
  status: "success";
  token: string;
  code: string;
  role: "member" | "viewer";
};

export async function createInvitationAction(
  role: "member" | "viewer",
): Promise<ActionState | InvitationCreated> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  if (role !== "member" && role !== "viewer") {
    return { status: "error", message: "Rol inválido." };
  }

  try {
    const household = await requireCurrentHousehold(ctx.supabase);
    const { token, code } = generateInvitationCredentials();

    await insertInvitation(ctx.supabase, {
      household_id: household.id,
      role,
      created_by: ctx.user.id,
      token,
      code,
    });

    revalidatePath("/hogar");
    return { status: "success", token, code, role };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "No pudimos crear la invitación.",
    };
  }
}

export async function cancelInvitationAction(
  invitationId: string,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  try {
    await deleteInvitation(ctx.supabase, invitationId);
    revalidatePath("/hogar");
    return { status: "success" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function joinByCodeOrTokenAction(
  lookup: string,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  const cleaned = lookup.trim();
  if (!cleaned) {
    return { status: "error", message: "Pegá el código o el link." };
  }

  try {
    // Si pasaron un link, extraemos el token de la URL.
    let value = cleaned;
    if (value.startsWith("http")) {
      try {
        const url = new URL(value);
        const parts = url.pathname.split("/").filter(Boolean);
        const idx = parts.indexOf("invite");
        if (idx >= 0 && parts[idx + 1]) {
          value = parts[idx + 1];
        }
      } catch {
        // si la URL es inválida, seguimos con el value original
      }
    }

    await acceptInvitation(ctx.supabase, value);
    revalidatePath("/hogar");
    revalidatePath("/inventario");
    revalidatePath("/compras");
    return {
      status: "success",
      message: "¡Listo! Ya formás parte del hogar.",
    };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "No pudimos procesar la invitación.",
    };
  }
}

export async function renameHouseholdAction(
  name: string,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  const trimmed = name.trim();
  if (!trimmed) {
    return { status: "error", message: "El nombre no puede quedar vacío." };
  }
  if (trimmed.length > 80) {
    return { status: "error", message: "Demasiado largo (máx 80 chars)." };
  }

  try {
    const household = await requireCurrentHousehold(ctx.supabase);
    await updateHouseholdName(ctx.supabase, household.id, trimmed);
    revalidatePath("/hogar");
    return { status: "success", message: "Hogar renombrado." };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function changeMemberRoleAction(
  userId: string,
  role: HouseholdRole,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  if (role !== "owner" && role !== "member" && role !== "viewer") {
    return { status: "error", message: "Rol inválido." };
  }

  try {
    const household = await requireCurrentHousehold(ctx.supabase);
    await setMemberRole(ctx.supabase, household.id, userId, role);
    revalidatePath("/hogar");
    return { status: "success" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function removeMemberAction(
  userId: string,
): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  try {
    const household = await requireCurrentHousehold(ctx.supabase);
    await removeMember(ctx.supabase, household.id, userId);
    revalidatePath("/hogar");
    return { status: "success" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

/**
 * El usuario se quita a sí mismo del hogar. Si era el último owner, le
 * impedimos salir (tendría que primero asignar a otro owner o eliminar el
 * hogar). Para uso doméstico esto es raro pero la guard evita un hogar sin
 * dueño.
 */
export async function leaveHouseholdAction(): Promise<ActionState> {
  const ctx = await getUserOrError();
  if (!ctx.ok) return { status: "error", message: ctx.message };

  try {
    const household = await requireCurrentHousehold(ctx.supabase);

    // ¿Cuántos owners hay?
    const { data: owners, error } = await ctx.supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", household.id)
      .eq("role", "owner");

    if (error) throw error;

    const isOwner = owners?.some((o) => o.user_id === ctx.user.id);
    if (isOwner && (owners?.length ?? 0) <= 1) {
      return {
        status: "error",
        message:
          "Sos el único dueño. Asigná dueño a otro miembro antes de salir, o eliminá el hogar.",
      };
    }

    await removeMember(ctx.supabase, household.id, ctx.user.id);
    revalidatePath("/hogar");
    return { status: "success", message: "Saliste del hogar." };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}
