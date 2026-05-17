"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UNIT_LABELS, type Location, type Unit } from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import {
  consumeProductAction,
  deleteProductAction,
  updateProductAction,
} from "../actions";
import { ProductForm } from "./product-form";

type Props = {
  product: ProductWithLocation | null;
  locations: Location[];
  onOpenChange: (open: boolean) => void;
};

export function ProductDetailSheet({ product, locations, onOpenChange }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const open = product !== null;

  function handleOpenChange(next: boolean) {
    if (!next) setMode("view");
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        {product && mode === "view" && (
          <ViewMode
            product={product}
            onEdit={() => setMode("edit")}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {product && mode === "edit" && (
          <>
            <SheetHeader>
              <SheetTitle>Editar producto</SheetTitle>
              <SheetDescription>
                Cambiá lo que necesites y guardá.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <ProductForm
                action={updateProductAction}
                locations={locations}
                product={product}
                submitLabel="Guardar cambios"
                onSuccess={() => handleOpenChange(false)}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ViewMode({
  product,
  onEdit,
  onClose,
}: {
  product: ProductWithLocation;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const qty = Number(product.quantity);
  const threshold = Number(product.low_stock_threshold);
  const unitLabel = UNIT_LABELS[product.unit as Unit] ?? product.unit;
  const step = ["un", "paq"].includes(product.unit) ? 1 : 0.1;

  function adjust(delta: number) {
    if (qty + delta < 0 && delta < 0 && qty === 0) return;
    startTransition(async () => {
      try {
        await consumeProductAction(product.id, -delta);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function consumeAll() {
    if (qty === 0) return;
    startTransition(async () => {
      try {
        await consumeProductAction(product.id, qty);
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar "${product.name}" del inventario?`)) return;
    startTransition(async () => {
      try {
        await deleteProductAction(product.id);
        onClose();
      } catch (err) {
        console.error(err);
      }
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8">{product.name}</SheetTitle>
        <SheetDescription>
          {[product.brand, product.category].filter(Boolean).join(" · ") ||
            "Sin marca ni categoría"}
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-4">
        <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Stock actual</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatQuantity(qty)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {unitLabel}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              umbral mínimo: {formatQuantity(threshold)} {unitLabel}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => adjust(-step)}
              disabled={pending || qty <= 0}
              aria-label="Restar"
            >
              <Minus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => adjust(step)}
              disabled={pending}
              aria-label="Sumar"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={consumeAll}
            disabled={pending || qty <= 0}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Consumir todo
          </Button>
          <Button type="button" variant="secondary" onClick={onEdit}>
            <Pencil className="size-4" />
            Editar
          </Button>
        </div>

        <Separator />

        <DetailRow label="Ubicación" value={product.location?.name ?? "Sin asignar"} />
        {product.barcode && (
          <DetailRow label="Código de barras" value={product.barcode} mono />
        )}
        {product.notes && (
          <DetailRow label="Notas" value={product.notes} />
        )}

        <Button
          type="button"
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={pending}
        >
          <Trash2 className="size-4" />
          Eliminar producto
        </Button>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-sm" : "text-sm"}>{value}</span>
    </div>
  );
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
