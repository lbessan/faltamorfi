"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Minus,
  Package2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UNIT_LABELS, type Location, type Unit } from "@/lib/database.types";
import {
  listStockItems,
  type StockItemWithLocation,
} from "@/lib/db/stock-items";
import { createClient } from "@/lib/supabase/client";
import type { ProductWithLocation } from "@/lib/db/products";
import {
  consumeProductAction,
  deleteProductAction,
  updateProductAction,
} from "../actions";
import { LotCard } from "./lot-card";
import { LotForm } from "./lot-form";
import { ProductForm } from "./product-form";

type Props = {
  product: ProductWithLocation | null;
  locations: Location[];
  warningDays: number;
  onOpenChange: (open: boolean) => void;
};

type Mode = "view" | "editProduct";

export function ProductDetailSheet({
  product,
  locations,
  warningDays,
  onOpenChange,
}: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const open = product !== null;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setMode("view");
      onOpenChange(next);
    },
    [onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto"
      >
        {product && mode === "view" && (
          <ViewMode
            product={product}
            locations={locations}
            warningDays={warningDays}
            onEditProduct={() => setMode("editProduct")}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {product && mode === "editProduct" && (
          <>
            <SheetHeader>
              <SheetTitle>Editar producto</SheetTitle>
              <SheetDescription>
                Datos generales del producto. Los lotes se gestionan aparte.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <ProductForm
                action={updateProductAction}
                locations={locations}
                product={product}
                submitLabel="Guardar cambios"
                onSuccess={() => setMode("view")}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

function ViewMode({
  product,
  locations,
  warningDays,
  onEditProduct,
  onClose,
}: {
  product: ProductWithLocation;
  locations: Location[];
  warningDays: number;
  onEditProduct: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lots, setLots] = useState<StockItemWithLocation[] | null>(null);
  const [lotsError, setLotsError] = useState<string | null>(null);
  const [showAddLot, setShowAddLot] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);

  // Refetch lots cada vez que abre el sheet o que el product cambia.
  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setLotsError(null);

    (async () => {
      try {
        const supabase = createClient();
        const data = await listStockItems(supabase, product.id);
        if (!cancelled) setLots(data);
      } catch (err) {
        if (!cancelled)
          setLotsError(
            err instanceof Error ? err.message : "Error cargando lotes.",
          );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product.id, product.updated_at]);

  const qty = Number(product.quantity);
  const threshold = Number(product.low_stock_threshold);
  const unitLabel = UNIT_LABELS[product.unit as Unit] ?? product.unit;
  const step = ["un", "paq"].includes(product.unit) ? 1 : 0.1;

  function adjust(delta: number) {
    if (delta < 0 && qty <= 0) return;
    if (delta < 0) {
      startTransition(async () => {
        try {
          await consumeProductAction(product.id, -delta);
          router.refresh();
        } catch (err) {
          console.error(err);
        }
      });
    } else {
      // Sumar = abrir el form de nuevo lote
      setShowAddLot(true);
    }
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

  function closeLotForm() {
    setShowAddLot(false);
    setEditingLotId(null);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-heading text-xl pr-8">
          {product.name}
        </SheetTitle>
        <SheetDescription>
          {[product.brand, product.category].filter(Boolean).join(" · ") ||
            "Sin marca ni categoría"}
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Stock total</div>
            <div className="text-2xl font-heading font-bold tabular-nums">
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
              aria-label="Consumir"
            >
              <Minus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => adjust(step)}
              disabled={pending}
              aria-label="Sumar lote"
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
            {pending && <Loader2 className="size-4 animate-spin" />}
            Consumir todo
          </Button>
          <Button type="button" variant="secondary" onClick={onEditProduct}>
            <Pencil className="size-4" />
            Editar
          </Button>
        </div>

        <Separator />

        {/* ----- Sección Lotes ----- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lotes
            </h2>
            {!showAddLot && !editingLotId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowAddLot(true)}
              >
                <Plus className="size-3.5" />
                Agregar
              </Button>
            )}
          </div>

          {showAddLot && (
            <LotForm
              productId={product.id}
              productName={product.name}
              locations={locations}
              defaultLocationId={product.default_location_id}
              onClose={closeLotForm}
            />
          )}

          {lots === null && !lotsError && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          )}

          {lotsError && (
            <p className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
              {lotsError}
            </p>
          )}

          {lots !== null && lots.length === 0 && !showAddLot && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <Package2 className="size-6 mx-auto mb-2 opacity-50" />
              No hay lotes cargados.
              <br />
              Agregá uno para llevar vencimientos.
            </div>
          )}

          {lots !== null && lots.length > 0 && (
            <ul className="space-y-2">
              {lots.map((lot) =>
                editingLotId === lot.id ? (
                  <li key={lot.id}>
                    <LotForm
                      productId={product.id}
                      productName={product.name}
                      locations={locations}
                      lot={lot}
                      onClose={closeLotForm}
                    />
                  </li>
                ) : (
                  <li key={lot.id}>
                    <LotCard
                      lot={lot}
                      unit={product.unit}
                      warningDays={warningDays}
                      onEdit={() => {
                        setShowAddLot(false);
                        setEditingLotId(lot.id);
                      }}
                    />
                  </li>
                ),
              )}
            </ul>
          )}
        </section>

        <Separator />

        {product.barcode && (
          <DetailRow label="Código de barras" value={product.barcode} mono />
        )}
        {product.notes && <DetailRow label="Notas" value={product.notes} />}

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
