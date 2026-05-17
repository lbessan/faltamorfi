/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// ----------------------------------------------------------------------------
// Web Push
//
// El servidor manda payloads JSON con la forma:
//   { title, body, url?, tag? }
// Mostramos una notification y al hacer click navegamos a `url` (o a /).
// ----------------------------------------------------------------------------

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

self.addEventListener("push", (event) => {
  const data = parsePushData(event.data);
  const title = data.title ?? "Falta Morfi";
  const options: NotificationOptions = {
    body: data.body ?? "Tenés algo por vencer.",
    icon: data.icon ?? "/icon.png",
    badge: data.badge ?? "/icon.png",
    tag: data.tag ?? "falta-morfi-default",
    data: { url: data.url ?? "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | null)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Si ya hay una ventana abierta de la app, focuseála y navegá adentro.
      for (const client of clientsList) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl).catch(() => undefined);
          }
          return;
        }
      }
      // Si no, abrí una pestaña nueva.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

function parsePushData(data: PushMessageData | null): PushPayload {
  if (!data) return {};
  try {
    return data.json() as PushPayload;
  } catch {
    return { body: data.text() };
  }
}
