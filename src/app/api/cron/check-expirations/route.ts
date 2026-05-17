/**
 * Cron diario: revisa lotes por vencer y manda un push a cada usuario con
 * notificaciones activadas. Vercel Cron llama a este endpoint con el header
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Plan de consumo: para cada usuario con notifications_enabled + push_subscription,
 * agrupamos sus lotes en {vencido, vence_pronto} y mandamos un push resumen.
 *
 * Para uso doméstico esto es N+1 friendly. Cuando escale, mover a una RPC
 * que devuelva el set ya pre-agrupado.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseSubscription, sendPush, type PushPayload } from "@/lib/notifications/push";

export const runtime = "nodejs";
// El cron tarda unos segundos si hay usuarios — damos margen.
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel manda Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  // Fallback útil para gatillarlo a mano vía curl en dev:
  if (request.nextUrl.searchParams.get("secret") === expected) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runExpirationCheck();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/check-expirations]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 },
    );
  }
}

type LotRow = {
  id: string;
  product_id: string;
  quantity: number;
  expires_on: string | null;
  frozen_at: string | null;
  frozen_max_days: number | null;
  products: {
    name: string;
    household_id: string;
  } | null;
};

type Summary = {
  usersChecked: number;
  pushesSent: number;
  expiredSubscriptionsCleared: number;
  errors: number;
};

async function runExpirationCheck(): Promise<Summary> {
  const supabase = createServiceClient();
  const summary: Summary = {
    usersChecked: 0,
    pushesSent: 0,
    expiredSubscriptionsCleared: 0,
    errors: 0,
  };

  // 1. Cargar todos los usuarios con notifications activas.
  const { data: subscribers, error: prefsError } = await supabase
    .from("user_preferences")
    .select("user_id, default_expiry_warning_days, push_subscription")
    .eq("notifications_enabled", true)
    .not("push_subscription", "is", null);

  if (prefsError) throw prefsError;
  if (!subscribers?.length) return summary;

  for (const prefs of subscribers) {
    summary.usersChecked++;
    const sub = parseSubscription(prefs.push_subscription);
    if (!sub) continue;

    const warningDays = prefs.default_expiry_warning_days ?? 3;

    // 2. Cargar los hogares del usuario.
    const { data: memberships, error: memError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", prefs.user_id);

    if (memError || !memberships?.length) {
      if (memError) summary.errors++;
      continue;
    }

    const householdIds = memberships.map((m) => m.household_id);

    // 3. Cargar lotes con vencimiento o freezer asignado de los hogares.
    const { data: lots, error: lotsError } = await supabase
      .from("stock_items")
      .select(
        "id, product_id, quantity, expires_on, frozen_at, frozen_max_days, products!inner(name, household_id)",
      )
      .in("products.household_id", householdIds)
      .gt("quantity", 0);

    if (lotsError) {
      summary.errors++;
      continue;
    }

    const buckets = bucketize((lots ?? []) as LotRow[], warningDays);
    if (buckets.expired.length === 0 && buckets.soon.length === 0) continue;

    const payload = composePayload(buckets, warningDays);

    const result = await sendPush(sub, payload);
    if (result.ok) {
      summary.pushesSent++;
    } else if (result.expired) {
      // Limpieza de subscriptions caducadas.
      await supabase
        .from("user_preferences")
        .update({ push_subscription: null, notifications_enabled: false })
        .eq("user_id", prefs.user_id);
      summary.expiredSubscriptionsCleared++;
    } else {
      summary.errors++;
    }
  }

  return summary;
}

type Buckets = {
  expired: Array<{ name: string; daysAgo: number }>;
  soon: Array<{ name: string; daysLeft: number }>;
};

function bucketize(lots: LotRow[], warningDays: number): Buckets {
  const now = startOfDay(new Date());
  const expired: Buckets["expired"] = [];
  const soon: Buckets["soon"] = [];

  for (const lot of lots) {
    const effective = effectiveExpiryDate(lot);
    if (!effective) continue;
    const days = diffDays(effective, now);
    const name = lot.products?.name ?? "(producto)";
    if (days < 0) {
      expired.push({ name, daysAgo: Math.abs(days) });
    } else if (days <= warningDays) {
      soon.push({ name, daysLeft: days });
    }
  }
  return { expired, soon };
}

function composePayload(buckets: Buckets, warningDays: number): PushPayload {
  const parts: string[] = [];
  if (buckets.expired.length) {
    const sample = buckets.expired
      .slice(0, 3)
      .map((e) => e.name)
      .join(", ");
    parts.push(
      `${buckets.expired.length} vencido${buckets.expired.length === 1 ? "" : "s"}: ${sample}`,
    );
  }
  if (buckets.soon.length) {
    const sample = buckets.soon
      .slice(0, 3)
      .map((e) => e.name)
      .join(", ");
    parts.push(
      `${buckets.soon.length} por vencer (≤${warningDays}d): ${sample}`,
    );
  }
  return {
    title: "Falta Morfi · Vencimientos",
    body: parts.join(" · "),
    url: "/inventario",
    tag: "expirations",
  };
}

function effectiveExpiryDate(lot: LotRow): Date | null {
  const explicit = lot.expires_on
    ? new Date(`${lot.expires_on}T00:00:00`)
    : null;
  let freezerLimit: Date | null = null;
  if (lot.frozen_at && lot.frozen_max_days) {
    const base = new Date(lot.frozen_at);
    freezerLimit = new Date(
      base.getTime() + lot.frozen_max_days * 24 * 60 * 60 * 1000,
    );
  }
  if (explicit && freezerLimit) {
    return explicit < freezerLimit ? explicit : freezerLimit;
  }
  return explicit ?? freezerLimit;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function diffDays(target: Date, from: Date): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.floor((target.getTime() - from.getTime()) / day);
}
