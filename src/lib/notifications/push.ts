/**
 * Wrapper de `web-push` para envío de notificaciones push a navegadores.
 *
 * Las VAPID keys identifican al sender ante los push services (FCM, Mozilla, etc).
 * Generadas una sola vez con: `npx web-push generate-vapid-keys`.
 */

import webpush, { type PushSubscription, type WebPushError } from "web-push";

let vapidConfigured = false;

function configure() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID no configurado: faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type SendPushOutcome =
  | { ok: true }
  | { ok: false; expired: true; reason: string }
  | { ok: false; expired: false; reason: string };

/**
 * Manda un push a una subscription. Si el endpoint devolvió 404/410, la
 * subscription expiró — el caller debería removerla de la DB.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<SendPushOutcome> {
  configure();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const wp = err as WebPushError;
    const status = wp.statusCode ?? 0;
    const reason =
      wp.body ?? (err instanceof Error ? err.message : "Error desconocido");
    const expired = status === 404 || status === 410;
    return { ok: false, expired, reason };
  }
}

/**
 * Cast seguro de un valor `unknown` (típicamente leído de la DB como Json) a
 * `PushSubscription`. Devuelve null si el shape no encaja.
 */
export function parseSubscription(value: unknown): PushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (typeof obj.endpoint !== "string") return null;
  if (
    !obj.keys ||
    typeof obj.keys.p256dh !== "string" ||
    typeof obj.keys.auth !== "string"
  ) {
    return null;
  }
  return {
    endpoint: obj.endpoint,
    keys: { p256dh: obj.keys.p256dh, auth: obj.keys.auth },
  };
}
