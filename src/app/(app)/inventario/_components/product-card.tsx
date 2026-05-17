"use client";

import Image from "next/image";
import { MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UNIT_LABELS, type Unit } from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";

type Props = {
  product: ProductWithLocation;
  onClick: () => void;
};

export function ProductCard({ product, onClick }: Props) {
  const qty = Number(product.quantity);
  const threshold = Number(product.low_stock_threshold);
  const low = qty <= threshold;
  const out = qty <= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card hover:bg-accent/40 active:scale-[0.99] transition-all p-3 flex items-center gap-3 group"
    >
      <ProductThumb
        imageUrl={product.image_url}
        name={product.name}
        out={out}
        low={low}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{product.name}</span>
          {out ? (
            <Badge variant="destructive" className="shrink-0">sin stock</Badge>
          ) : low ? (
            <Badge className="bg-warning text-warning-foreground hover:bg-warning shrink-0">
              stock bajo
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 truncate">
          {product.brand && <span className="truncate">{product.brand}</span>}
          {product.location && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <MapPin className="size-3" />
              {product.location.name}
            </span>
          )}
        </div>
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
          className="object-cover"
        />
      ) : (
        <span className="font-heading font-bold text-lg text-muted-foreground">
          {initial || <Package className="size-5" />}
        </span>
      )}
    </div>
  );
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
