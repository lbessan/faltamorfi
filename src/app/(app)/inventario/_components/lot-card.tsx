"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  CalendarClock,
  Loader2,
  PackageOpen,
  Pencil,
  Snowflake,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UNIT_LABELS, type Unit } from "@/lib/database.types";
import type { Lot } from "@/lib/db/stock-items";
import { effectiveExpiry as computeEffectiveExpiry } from "@/lib/expiry";
import { deleteLotAction } from "../actions";

type Props = {
  lot: Lot;
  unit: string;
  warningDays: number;
  /** Si es null, el lote es read-only (no se muestran botones de editar/eliminar). */
  onEdit: (() => void) | null;
};

export function LotCard({ lot, unit, warningDays, onEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effectiveExpiration = effectiveExpiry(lot);
  const status = expirationStatus(effectiveExpiration, warningDays);
  const unitLabel = UNIT_LABELS[unit as Unit] ?? unit;

  function handleDelete() {
    startTransition(async () => {
      await deleteLotAction(lot.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-3">
        {/* Imagen */}
        <div className="relative size-12 rounded-lg overflow-hidden bg-muted shrink-0">
          {lot.image_url ? (
            <Image
              src={lot.image_url}
              alt={lot.brand ?? "Lote"}
              fill
              sizes="48px"
              className="object-contain"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-heading font-bold text-muted-foreground">
              {(lot.brand ?? "·").charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold tabular-nums">
              {formatQty(Number(lot.quantity))}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {unitLabel}
              </span>
            </span>
            <ExpirationBadge status={status} />
          </div>

          {(lot.brand || lot.barcode) && (
            <div className="text-sm truncate">
              {lot.brand && <span>{lot.brand}</span>}
              {lot.brand && lot.barcode && (
                <span className="text-muted-foreground"> · </span>
              )}
              {lot.barcode && (
                <span className="text-xs font-mono text-muted-foreground">
                  {lot.barcode}
                </span>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            {effectiveExpiration && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                {formatRelativeDate(effectiveExpiration)}
              </span>
            )}
            {lot.frozen_at && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Snowflake className="size-3" />
                Freezado {formatShortDate(lot.frozen_at)}
                {lot.frozen_max_days && ` · máx ${lot.frozen_max_days}d`}
              </span>
            )}
            {lot.opened_at && (
              <span className="inline-flex items-center gap-1 text-primary">
                <PackageOpen className="size-3" />
                Abierto {formatShortDate(lot.opened_at)}
                {lot.opened_max_days && ` · máx ${lot.opened_max_days}d`}
              </span>
            )}
          </div>
        </div>

        {onEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="size-8"
              aria-label="Editar lote"
              disabled={pending}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setConfirmDelete((v) => !v)}
              className="size-8 text-destructive hover:text-destructive"
              aria-label="Eliminar lote"
              disabled={pending}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-muted-foreground">¿Eliminar el lote?</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending && <Loader2 className="size-3 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

type ExpirationStatus =
  | { kind: "none" }
  | { kind: "expired"; days: number }
  | { kind: "soon"; days: number }
  | { kind: "ok"; days: number };

function effectiveExpiry(lot: Lot): Date | null {
  return computeEffectiveExpiry(lot);
}

function expirationStatus(
  date: Date | null,
  warningDays: number,
): ExpirationStatus {
  if (!date) return { kind: "none" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((date.getTime() - now.getTime()) / dayMs);
  if (days < 0) return { kind: "expired", days: Math.abs(days) };
  if (days <= warningDays) return { kind: "soon", days };
  return { kind: "ok", days };
}

function ExpirationBadge({ status }: { status: ExpirationStatus }) {
  if (status.kind === "expired") {
    return (
      <Badge variant="destructive">
        Vencido{status.days > 0 ? ` hace ${status.days}d` : ""}
      </Badge>
    );
  }
  if (status.kind === "soon") {
    return (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning">
        Vence en {status.days}d
      </Badge>
    );
  }
  return null;
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatRelativeDate(d: Date): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((d.getTime() - now.getTime()) / dayMs);
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days < 0)
    return `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`;
  if (days <= 14) return `En ${days} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
