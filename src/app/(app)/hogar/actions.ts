"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateUserPreferences } from "@/lib/db/preferences";
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
