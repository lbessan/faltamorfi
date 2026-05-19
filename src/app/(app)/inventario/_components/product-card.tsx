"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Loader2,
  Minus,
  Plus,
  Snowflake,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UNIT_LABELS, type Unit } from "@/lib/database.types";
import type { LotSummary, ProductWithLots } from "@/lib/db/products";
import type { ConsumptionRate } from "@/lib/db/predictions";
import { effectiveExpiry } from "@/lib/expiry";
import { DynamicIcon } from "@/lib/icon-map";
import { consumeLotAction } from "../actions";

type Props = {
  product: ProductWithLots;
  warningDays: number;
  canEdit: boolean;
  /** Click en el header (icono + nombre): abre el detail-sheet con stats. */
  onOpenDetail: () => void;
  /** Click en el botón + (sumar lote nuevo): abre el form de nuevo lote. */
  onAddLot: () => void;
  rate?: ConsumptionRate;
};

const COLLAPSE_THRESHOLD = 2;

export function ProductCard({
  product,
  warningDays,
  canEdit,
  onOpenDetail,
  onAddLot,
}: Props) {
  const qty = Number(product.quantity);
  const threshold = Number(product.low_stock_threshold);
  const low = qty <= threshold && qty > 0;
  const out = qty <= 0;
  const unitLabel = UNIT_LABELS[product.unit as Unit] ?? product.unit;
  const step = ["un", "paq"].includes(product.unit) ? 1 : 0.1;

  const thumbUrl = pickThumbUrl(product.lots);
  const sortedLots = sortLotsByExpiry(product.lots);

  const [expanded, setExpanded] = useState(sortedLots.length <= COLLAPSE_THRESHOLD);
  const visibleLots = expanded ? sortedLots : sortedLots.slice(0, 1);
  const collapsedExtra = sortedLots.length - visibleLots.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-accent/30 active:scale-[0.995] transition-all"
          aria-label={`Ver detalle de ${product.name}`}
        >
          <ProductThumb
            imageUrl={thumbUrl}
            iconName={product.icon}
            name={product.name}
            out={out}
            low={low}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{product.name}</span>
              {out ? (
                <Badge variant="destructive" className="shrink-0">
                  sin stock
                </Badge>
              ) : low ? (
                <Badge className="bg-warning text-warning-foreground hover:bg-warning shrink-0">
                  stock bajo
                </Badge>
              ) : null}
            </div>
            {(product.category || threshold > 0) && (
              <div className="text-xs text-muted-foreground truncate">
                {product.category}
                {product.category && threshold > 0 && " · "}
                {threshold > 0 && (
                  <>mín {formatQuantity(threshold)} {unitLabel}</>
                )}
              </div>
            )}
          </div>
        </button>

        <div className="text-right shrink-0">
          <div className="font-heading text-lg font-bold tabular-nums leading-tight">
            {formatQuantity(qty)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {unitLabel}
          </div>
        </div>

        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onAddLot}
            aria-label="Agregar lote"
            className="size-9 shrink-0"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {/* Lista de lotes (inline) */}
      {sortedLots.length > 0 && (
        <div className="border-t border-border bg-muted/30">
          <ul className="divide-y divide-border">
            {visibleLots.map((lot) => (
              <LotRow
                key={lot.id}
                lot={lot}
                unitLabel={unitLabel}
                step={step}
                warningDays={warningDays}
                canEdit={canEdit}
              />
            ))}
          </ul>
          {!expanded && collapsedExtra > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/40 flex items-center justify-center gap-1"
            >
              <ChevronDown className="size-3" />
              Ver {collapsedExtra} lote{collapsedExtra === 1 ? "" : "s"} más
            </button>
          )}
          {expanded && sortedLots.length > COLLAPSE_THRESHOLD && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/40 flex items-center justify-center gap-1"
            >
              <ChevronUp className="size-3" />
              Ocultar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function LotRow({
  lot,
  unitLabel,
  step,
  warningDays,
  canEdit,
}: {
  lot: LotSummary;
  unitLabel: string;
  step: number;
  warningDays: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const qty = Number(lot.quantity);
  const exp = effectiveExpiry(lot);
  const expInfo = exp ? describeDaysLeft(exp, warningDays) : null;

  function consume() {
    if (qty <= 0) return;
    startTransition(async () => {
      await consumeLotAction(lot.id, Math.min(step, qty));
      router.refresh();
    });
  }

  return (
    <li className="px-3 py-2 flex items-center gap-2">
      <span className="font-medium tabular-nums text-sm shrink-0 w-12">
        {formatQuantity(qty)} <span className="text-[10px] text-muted-foreground font-normal">{unitLabel}</span>
      </span>

      <div className="flex-1 min-w-0 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
        {lot.brand && (
          <span className="text-foreground truncate">{lot.brand}</span>
        )}
        {expInfo && (
          <span
            className={`inline-flex items-center gap-1 ${
              expInfo.urgent ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            <CalendarClock className="size-3" />
            {expInfo.label}
          </span>
        )}
        {lot.frozen_at && (
          <span
            className="inline-flex items-center gap-1 text-primary"
            title="En el freezer"
          >
            <Snowflake className="size-3" />
          </span>
        )}
        {lot.opened_at && (
          <span
            className="inline-flex items-center gap-1 text-primary"
            title="Abierto en heladera"
          >
            <DoorOpen className="size-3" />
          </span>
        )}
      </div>

      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={consume}
          disabled={pending || qty <= 0}
          aria-label="Consumir uno"
          title="Consumir"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Minus className="size-3.5" />
          )}
        </Button>
      )}
    </li>
  );
}

function ProductThumb({
  imageUrl,
  iconName,
  name,
  out,
  low,
}: {
  imageUrl: string | null;
  iconName: string | null;
  name: string;
  out: boolean;
  low: boolean;
}) {
  const ringClass = out
    ? "ring-2 ring-destructive/40"
    : low
      ? "ring-2 ring-warning/60"
      : "ring-1 ring-border";

  return (
    <div
      className={`relative size-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 ${ringClass}`}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="48px"
          className="object-contain"
        />
      ) : (
        <DynamicIcon
          name={iconName}
          className="size-5 text-muted-foreground"
          strokeWidth={1.7}
        />
      )}
    </div>
  );
}

function pickThumbUrl(lots: LotSummary[]): string | null {
  for (let i = lots.length - 1; i >= 0; i--) {
    if (lots[i].image_url) return lots[i].image_url;
  }
  return null;
}

/** Ordena lotes por vencimiento efectivo, los sin fecha al final. */
function sortLotsByExpiry(lots: LotSummary[]): LotSummary[] {
  const withDates = lots.map((l) => ({ lot: l, exp: effectiveExpiry(l) }));
  withDates.sort((a, b) => {
    if (a.exp && b.exp) return a.exp.getTime() - b.exp.getTime();
    if (a.exp) return -1;
    if (b.exp) return 1;
    return 0;
  });
  return withDates.map((d) => d.lot);
}

function describeDaysLeft(
  date: Date,
  warningDays: number,
): { label: string; urgent: boolean } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((date.getTime() - now.getTime()) / dayMs);

  if (days < 0) {
    return {
      label: `vencido hace ${Math.abs(days)}d`,
      urgent: true,
    };
  }
  if (days === 0) return { label: "vence hoy", urgent: true };
  if (days === 1) return { label: "vence mañana", urgent: true };
  if (days <= warningDays) return { label: `${days}d`, urgent: true };
  if (days <= 30) return { label: `${days}d`, urgent: false };
  return {
    label: date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
    }),
    urgent: false,
  };
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
