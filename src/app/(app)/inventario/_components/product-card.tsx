"use client";

import { MapPin } from "lucide-react";
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
      className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors p-3 flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{product.name}</span>
          {out ? (
            <Badge variant="destructive">sin stock</Badge>
          ) : low ? (
            <Badge variant="secondary">stock bajo</Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
          {product.brand && <span className="truncate">{product.brand}</span>}
          {product.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {product.location.name}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-semibold tabular-nums">
          {formatQuantity(qty)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {UNIT_LABELS[product.unit as Unit] ?? product.unit}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          mín {formatQuantity(threshold)}
        </div>
      </div>
    </button>
  );
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
