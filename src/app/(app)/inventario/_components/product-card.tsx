"use client";

import Image from "next/image";
import { CalendarClock, MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UNIT_LABELS, type Unit } from "@/lib/database.types";
import type { LotSummary, ProductWithLocation } from "@/lib/db/products";

type Props = {
  product: ProductWithLocation;
  warningDays: number;
  onClick: () => void;
};

export function ProductCard({ product, warningDays, onClick }: Props) {
  const qty = Number(product.quantity);
  const threshold = Number(product.low_stock_threshold);
  const low = qty <= threshold;
  const out = qty <= 0;

  const brandSummary = summarizeBrands(product.lots);
  const thumbUrl = pickThumbUrl(product.lots);
  const nextExp = nextExpirationInfo(product.lots, warningDays);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card hover:bg-accent/40 active:scale-[0.99] transition-all p-3 flex items-center gap-3 group"
    >
      <ProductThumb
        imageUrl={thumbUrl}
        name={product.name}
        out={out}
        low={low}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{product.name}</span>
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
        <div className="text-xs text-muted-foreground flex items-center gap-x-2 gap-y-0.5 mt-0.5 truncate">
          {brandSummary && <span className="truncate">{brandSummary}</span>}
          {product.location && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <MapPin className="size-3" />
              {product.location.name}
            </span>
          )}
        </div>
        {nextExp && (
          <div
            className={`text-xs mt-0.5 inline-flex items-center gap-1 ${
              nextExp.urgent ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            <CalendarClock className="size-3" />
            {nextExp.label}
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className="font-semibold tabular-nums leading-tight">
          {formatQuantity(qty)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {UNIT_LABELS[product.unit as Unit] ?? product.unit}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          mín {formatQuantity(threshold)}
        </div>
      </div>
    </button>
  );
}

function ProductThumb({
  imageUrl,
  name,
  out,
  low,
}: {
  imageUrl: string | null;
  name: string;
  out: boolean;
  low: boolean;
}) {
  const initial = name.charAt(0).toUpperCase();
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
        <span className="font-heading font-bold text-lg text-muted-foreground">
          {initial || <Package className="size-5" />}
        </span>
      )}
    </div>
  );
}

function summarizeBrands(lots: LotSummary[]): string | null {
  const brands = new Set(
    lots
      .map((l) => l.brand?.trim())
      .filter((b): b is string => Boolean(b)),
  );
  if (brands.size === 0) return null;
  if (brands.size === 1) return [...brands][0];
  return `${brands.size} marcas`;
}

function pickThumbUrl(lots: LotSummary[]): string | null {
  // Preferimos la imagen del lote más reciente (último en created_at).
  // Como ya viene ordenado por created_at en el RLS, basta usar el último.
  for (let i = lots.length - 1; i >= 0; i--) {
    if (lots[i].image_url) return lots[i].image_url;
  }
  return null;
}

type NextExpiration = {
  label: string;
  urgent: boolean;
};

function nextExpirationInfo(
  lots: LotSummary[],
  warningDays: number,
): NextExpiration | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  let nearest: { date: Date; days: number } | null = null;

  for (const lot of lots) {
    const expiry = effectiveExpiry(lot);
    if (!expiry) continue;
    const days = Math.floor((expiry.getTime() - now.getTime()) / dayMs);
    if (!nearest || days < nearest.days) {
      nearest = { date: expiry, days };
    }
  }

  if (!nearest) return null;

  if (nearest.days < 0) {
    return {
      label: `Vencido hace ${Math.abs(nearest.days)} día${Math.abs(nearest.days) === 1 ? "" : "s"}`,
      urgent: true,
    };
  }
  if (nearest.days === 0) {
    return { label: "Vence hoy", urgent: true };
  }
  if (nearest.days === 1) {
    return { label: "Vence mañana", urgent: true };
  }
  if (nearest.days <= warningDays) {
    return { label: `Vence en ${nearest.days} días`, urgent: true };
  }
  if (nearest.days <= 14) {
    return { label: `Vence en ${nearest.days} días`, urgent: false };
  }
  return {
    label: `Vence ${nearest.date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
    })}`,
    urgent: false,
  };
}

function effectiveExpiry(lot: LotSummary): Date | null {
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

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
