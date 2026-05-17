"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  Loader2,
  Send,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendTestPushAction,
  subscribeToPushAction,
  unsubscribeFromPushAction,
  updateAlertDaysAction,
} from "../actions";

type Props = {
  initialEnabled: boolean;
  initialDays: number;
  vapidPublicKey: string | null;
};

type Support = "checking" | "supported" | "unsupported" | "denied";

export function NotificationsSettings({
  initialEnabled,
  initialDays,
  vapidPublicKey,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [days, setDays] = useState<string>(String(initialDays));
  const [support, setSupport] = useState<Support>("checking");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  // Detección de soporte del navegador. Lo hacemos en useEffect (en lugar de
  // un lazy initializer) para evitar mismatch de hidratación SSR/CSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let next: Support;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      next = "unsupported";
    } else if (Notification.permission === "denied") {
      next = "denied";
    } else {
      next = "supported";
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(next);
  }, []);

  async function handleToggle() {
    if (!vapidPublicKey) {
      setFeedback({
        kind: "error",
        message:
          "Falta la VAPID public key del servidor. Avisame para que la configuremos.",
      });
      return;
    }

    setFeedback(null);

    if (enabled) {
      // Desactivar: borrar subscription tanto en server como en navegador
      startTransition(async () => {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
          const result = await unsubscribeFromPushAction();
          if (result.status === "error") {
            setFeedback({ kind: "error", message: result.message });
            return;
          }
          setEnabled(false);
          setFeedback({ kind: "success", message: "Notificaciones desactivadas." });
          router.refresh();
        } catch (err) {
          setFeedback({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Error desactivando.",
          });
        }
      });
      return;
    }

    // Activar: pedir permiso, suscribirse, mandar al server
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSupport(permission === "denied" ? "denied" : "supported");
          setFeedback({
            kind: "error",
            message:
              "No diste permiso al navegador para mostrarte notificaciones.",
          });
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        // Si ya hay una subscription previa, la reutilizamos
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            // El tipo de PushSubscriptionOptionsInit en TS 5 espera ArrayBuffer
            // estricto; nuestro helper devuelve Uint8Array que es compatible.
            applicationServerKey: urlBase64ToUint8Array(
              vapidPublicKey,
            ) as BufferSource,
          });
        }
        const result = await subscribeToPushAction(sub.toJSON());
        if (result.status === "error") {
          setFeedback({ kind: "error", message: result.message });
          return;
        }
        setEnabled(true);
        setFeedback({
          kind: "success",
          message: "Notificaciones activadas en este dispositivo.",
        });
        router.refresh();
      } catch (err) {
        setFeedback({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "No pudimos activar las notificaciones.",
        });
      }
    });
  }

  function handleDaysBlur() {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      setFeedback({
        kind: "error",
        message: "Tiene que ser un número entre 0 y 60.",
      });
      setDays(String(initialDays));
      return;
    }
    if (Math.round(n) === initialDays) return; // sin cambios
    startTransition(async () => {
      const result = await updateAlertDaysAction(Math.round(n));
      if (result.status === "error") {
        setFeedback({ kind: "error", message: result.message });
        setDays(String(initialDays));
      } else {
        setFeedback({
          kind: "success",
          message: `Aviso configurado a ${Math.round(n)} días.`,
        });
        router.refresh();
      }
    });
  }

  function handleTest() {
    setFeedback(null);
    startTransition(async () => {
      const result = await sendTestPushAction();
      if (result.status === "success") {
        setFeedback({
          kind: "success",
          message: result.message ?? "Push enviado.",
        });
      } else if (result.status === "error") {
        setFeedback({ kind: "error", message: result.message });
      }
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Notificaciones
      </h2>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {/* Toggle */}
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-sm">
              Avisos de vencimiento
            </div>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "Activadas en este dispositivo."
                : "Te avisamos cuando algo está por vencerse."}
            </p>
          </div>
          <Button
            type="button"
            variant={enabled ? "outline" : "default"}
            size="sm"
            onClick={handleToggle}
            disabled={
              pending || support === "checking" || support === "unsupported"
            }
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : enabled ? (
              <BellOff className="size-4" />
            ) : (
              <Bell className="size-4" />
            )}
            {enabled ? "Desactivar" : "Activar"}
          </Button>
        </div>

        {/* Días */}
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="alert-days" className="font-medium text-sm">
              Avisar
            </Label>
            <p className="text-xs text-muted-foreground">
              Cuántos días antes del vencimiento mostrar el aviso.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Input
              id="alert-days"
              type="number"
              inputMode="numeric"
              min="0"
              max="60"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              onBlur={handleDaysBlur}
              className="w-16 text-center"
            />
            <span className="text-sm text-muted-foreground">días</span>
          </div>
        </div>

        {/* Test push */}
        {enabled && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm">Probar</div>
              <p className="text-xs text-muted-foreground">
                Mandate un push ahora para verificar que llega.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar
            </Button>
          </div>
        )}
      </div>

      {/* Estados de browser support */}
      {support === "unsupported" && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1">
          <TriangleAlert className="size-3.5 mt-0.5 shrink-0" />
          Este navegador no soporta notificaciones push. Probá desde Chrome,
          Firefox o Safari 16+ en iOS con la app instalada como PWA.
        </p>
      )}
      {support === "denied" && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1">
          <TriangleAlert className="size-3.5 mt-0.5 shrink-0" />
          Bloqueaste las notificaciones para este sitio. Habilitalas desde la
          configuración del navegador (candado al lado de la URL).
        </p>
      )}

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`text-xs px-3 py-2 rounded-md border ${
            feedback.kind === "error"
              ? "text-destructive border-destructive/30"
              : "text-foreground border-border bg-muted"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}

// Convierte la VAPID public key (URL-safe base64) al Uint8Array que pide
// `pushManager.subscribe({ applicationServerKey })`.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData =
    typeof window === "undefined"
      ? Buffer.from(base64, "base64").toString("binary")
      : window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
