"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  CalendarClock,
  Hourglass,
  Loader2,
  Minus,
  Package2,
  Pencil,
  Plus,
  Snowflake,
  Sparkles,
  Trash2,
  TrendingDown,
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
import {
  fetchRecentConsumption,
  formatDailyRate,
  formatDaysLeft,
  predictDaysLeft,
  type ConsumptionRate,
  type RecentConsumption,
} from "@/lib/db/predictions";
import { createClient } from "@/lib/supabase/client";
import type { ProductWithLocation } from "@/lib/db/products";
import { lookupBarcode } from "@/lib/openfoodfacts";
import { BarcodeScannerSheet } from "@/components/barcode-scanner";
import {
  consumeProductAction,
  deleteProductAction,
  updateProductAction,
} from "../actions";
import { LotCard } from "./lot-card";
import { LotForm, type LotPrefill } from "./lot-form";
import { ProductForm } from "./product-form";

type Props = {
  product: ProductWithLocation | null;
  locations: Location[];
  warningDays: number;
  canEdit: boolean;
  rate?: ConsumptionRate;
  onOpenChange: (open: boolean) => void;
};

type Mode = "view" | "editProduct";

export function ProductDetailSheet({
  product,
  locations,
  warningDays,
  canEdit,
  rate,
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
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        {product && mode === "view" && (
          <ViewMode
            product={product}
            locations={locations}
            warningDays={warningDays}
            canEdit={canEdit}
            rate={rate}
            onEditProduct={() => setMode("editProduct")}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {product && mode === "editProduct" && (
          <>
            <SheetHeader>
              <SheetTitle>Editar producto</SheetTitle>
              <SheetDescription>
                Datos del tipo. La marca, código y vto se editan en cada lote.
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
  canEdit,
  rate,
  onEditProduct,
  onClose,
}: {
  product: ProductWithLocation;
  locations: Location[];
  warningDays: number;
  canEdit: boolean;
  rate?: ConsumptionRate;
  onEditProduct: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lots, setLots] = useState<StockItemWithLocation[] | null>(null);
  const [lotsError, setLotsError] = useState<string | null>(null);
  const [showAddLot, setShowAddLot] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lotPrefill, setLotPrefill] = useState<LotPrefill | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [history, setHistory] = useState<RecentConsumption[] | null>(null);

  // Reset cuando cambia el producto. Patrón "state derived from props".
  const productKey = `${product.id}-${product.updated_at}`;
  const [previousKey, setPreviousKey] = useState(productKey);
  if (previousKey !== productKey) {
    setPreviousKey(productKey);
    setLots(null);
    setLotsError(null);
    setShowAddLot(false);
    setEditingLotId(null);
    setLotPrefill(null);
    setScannerOpen(false);
    setHistory(null);
  }

  // Refetch lots e historial cuando cambia el producto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const data = await listStockItems(supabase, product.id);
        if (!cancelled) setLots(data);
      } catch (err) {
        if (!cancelled)
          setLotsError(
            err instanceof Error ? err.message : "Error cargando lotes.",
          );
      }
      try {
        const recent = await fetchRecentConsumption(supabase, product.id, 10);
        if (!cancelled) setHistory(recent);
      } catch {
        if (!cancelled) setHistory([]);
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
      // Sumar = abrir el form de nuevo lote (con prefill limpio)
      setLotPrefill(null);
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
    setLotPrefill(null);
  }

  function openScanner() {
    setScannerOpen(true);
  }

  function handleScanned(rawBarcode: string) {
    const barcode = rawBarcode.trim();
    if (!barcode) return;
    setScannerOpen(false);
    startLookup(async () => {
      let prefill: LotPrefill = { barcode };
      try {
        const off = await lookupBarcode(barcode);
        if (off) {
          prefill = {
            barcode: off.barcode,
            brand: off.brand,
            image_url: off.imageUrl,
          };
        }
      } catch {
        // Si falla OFF, seguimos con solo el barcode.
      }
      setLotPrefill(prefill);
      setShowAddLot(true);
    });
  }

  // Mostrar info "inline" (marca/vto) solo si hay un único lote.
  const inlineLot = lots && lots.length === 1 ? lots[0] : null;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-heading text-xl pr-8">
          {product.name}
        </SheetTitle>
        <SheetDescription>
          {[product.category, `${formatQuantity(qty)} ${unitLabel}`]
            .filter(Boolean)
            .join(" · ")}
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-4">
        {/* Card principal de stock con +/- */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          {inlineLot && inlineLot.image_url && (
            <div className="relative size-16 rounded-lg overflow-hidden bg-muted shrink-0">
              <Image
                src={inlineLot.image_url}
                alt={inlineLot.brand ?? product.name}
                fill
                sizes="64px"
                className="object-contain"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Stock total</div>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {formatQuantity(qty)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {unitLabel}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              mínimo: {formatQuantity(threshold)} {unitLabel}
            </div>
            {inlineLot && (inlineLot.brand || inlineLot.expires_on) && (
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                {inlineLot.brand && <span>{inlineLot.brand}</span>}
                {inlineLot.expires_on && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3" />
                    {formatLongDate(inlineLot.expires_on)}
                  </span>
                )}
                {inlineLot.frozen_at && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Snowflake className="size-3" />
                    Freezado
                  </span>
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
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
          )}
        </div>

        {canEdit && (
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
        )}

        <Separator />

        {/* ----- Sección Lotes ----- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {inlineLot ? "Detalle del lote" : "Lotes"}
              {lots && lots.length > 1 && (
                <span className="text-muted-foreground/60 ml-1 normal-case">
                  ({lots.length})
                </span>
              )}
            </h2>
            {canEdit && !showAddLot && !editingLotId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLotPrefill(null);
                  setShowAddLot(true);
                }}
                disabled={lookupPending}
              >
                {lookupPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Agregar
              </Button>
            )}
          </div>

          {showAddLot && (
            <LotForm
              key={`new-${lotPrefill?.barcode ?? "manual"}`}
              productId={product.id}
              productName={product.name}
              productCategory={product.category}
              locations={locations}
              defaultLocationId={product.default_location_id}
              prefill={lotPrefill ?? undefined}
              onScanClick={openScanner}
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
                      productCategory={product.category}
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
                      onEdit={
                        canEdit
                          ? () => {
                              setShowAddLot(false);
                              setEditingLotId(lot.id);
                            }
                          : null
                      }
                    />
                  </li>
                ),
              )}
            </ul>
          )}
        </section>

        <Separator />

        <ConsumptionSection
          product={product}
          rate={rate}
          history={history}
          qty={qty}
          unitLabel={unitLabel}
        />

        {product.notes && (
          <>
            <Separator />
            <DetailRow label="Notas del tipo" value={product.notes} />
          </>
        )}

        {canEdit && (
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
        )}
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanned}
        title="Escanear lote"
        description={`Apuntá la cámara al código del ${product.name.toLowerCase()}.`}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function ConsumptionSection({
  product,
  rate,
  history,
  qty,
  unitLabel,
}: {
  product: ProductWithLocation;
  rate?: ConsumptionRate;
  history: RecentConsumption[] | null;
  qty: number;
  unitLabel: string;
}) {
  const prediction = predictDaysLeft(rate, qty);
  const hasData =
    prediction.confidence !== "none" && (rate?.consumption_events ?? 0) > 0;

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <TrendingDown className="size-4" />
        Tu consumo
      </h2>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          <Sparkles className="size-4 mx-auto mb-1 opacity-60" />
          Todavía no tenemos suficiente historial. Con un par de
          &quot;consumir&quot; o &quot;consumir todo&quot; ya podemos estimar
          cuánto te dura.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              icon={<TrendingDown className="size-4 text-muted-foreground" />}
              label="Promedio"
              value={formatDailyRate(prediction.dailyRate, unitLabel)}
            />
            <Stat
              icon={<Hourglass className="size-4 text-muted-foreground" />}
              label="Te dura"
              value={
                prediction.daysLeft !== null
                  ? formatDaysLeft(prediction.daysLeft)
                  : "—"
              }
            />
          </div>
          <ConfidenceLine
            confidence={prediction.confidence}
            events={prediction.events}
            totalConsumed={prediction.totalConsumed}
            unit={product.unit}
          />
        </div>
      )}

      {/* Historial reciente */}
      {history !== null && history.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Últimos {history.length} consumos
          </div>
          <ul className="divide-y divide-border max-h-48 overflow-y-auto">
            {history.map((h) => (
              <li
                key={h.id}
                className="px-3 py-2 flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">
                    {h.quantity > 0
                      ? `−${formatQuantity(Number(h.quantity))} ${unitLabel}`
                      : `+${formatQuantity(Math.abs(Number(h.quantity)))} ${unitLabel}`}
                  </div>
                  {h.note && (
                    <div className="text-xs text-muted-foreground truncate">
                      {h.note}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTimestamp(h.occurred_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

function ConfidenceLine({
  confidence,
  events,
  totalConsumed,
  unit,
}: {
  confidence: "none" | "low" | "medium" | "high";
  events: number;
  totalConsumed: number;
  unit: string;
}) {
  const unitLabel = unit === "un" ? "" : ` ${unit}`;
  return (
    <p className="text-[11px] text-muted-foreground">
      Basado en {events} consumo{events === 1 ? "" : "s"} de los últimos 60
      días ({formatQuantity(totalConsumed)}
      {unitLabel} en total)
      {confidence === "low" && (
        <span className="text-warning-foreground/80">
          {" "}
          · pocos datos, la estimación puede variar
        </span>
      )}
      .
    </p>
  );
}

function formatRelativeTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((d.getTime() - now.getTime()) / dayMs);
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days < 0) return `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`;
  if (days <= 14) return `Vence en ${days} días`;
  return `Vence ${d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}`;
}
