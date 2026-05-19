"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, ScanLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  isDepartment,
  type Department,
} from "@/lib/database.types";
import type { ProductWithLots } from "@/lib/db/products";
import type { ConsumptionRate } from "@/lib/db/predictions";
import { lookupBarcode } from "@/lib/openfoodfacts";
import { BarcodeScannerSheet } from "@/components/barcode-scanner";
import { DynamicIcon } from "@/lib/icon-map";
import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";
import { ProductCard } from "./product-card";
import { AddProductSheet } from "./add-product-sheet";
import { ProductDetailSheet } from "./product-detail-sheet";
import type { LotPrefill } from "./lot-form";

type Props = {
  householdId: string;
  householdName: string;
  products: ProductWithLots[];
  warningDays: number;
  canEdit: boolean;
  /** Tasas de consumo por producto (record para passing server→client). */
  ratesByProduct: Record<string, ConsumptionRate>;
};

export function InventoryView({
  householdId,
  householdName,
  products,
  warningDays,
  canEdit,
  ratesByProduct,
}: Props) {
  // Cuando otro miembro del hogar agrega/consume/edita productos o lotes,
  // recibimos un evento y refrescamos. RLS hace el resto.
  useRealtimeRefresh({
    tables: [
      { table: "products", filter: `household_id=eq.${householdId}` },
      // stock_items no tiene household_id directo; aceptamos cualquier evento
      // y el refresh (que pasa por RLS) filtra los que pertenecen al hogar.
      { table: "stock_items" },
    ],
  });

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<LotPrefill | null>(null);
  const [addSuggestedMatch, setAddSuggestedMatch] =
    useState<ProductWithLots | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductWithLots | null>(null);
  /** Si abrimos el detail con intención de agregar un lote, lo marcamos. */
  const [selectedAddLot, setSelectedAddLot] = useState(false);
  const [lookupPending, startLookup] = useTransition();
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Solo mostramos productos activos con stock > 0. Los activos sin stock van a /compras.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.is_active) return false;
      if (Number(p.quantity) <= 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        p.lots.some(
          (l) => (l.brand ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [products, query]);

  // Agrupar por departamento, respetando el orden canónico.
  const grouped = useMemo(() => groupByDepartment(filtered), [filtered]);

  const lowStockCount = products.filter(
    (p) =>
      p.is_active &&
      Number(p.quantity) > 0 &&
      Number(p.quantity) <= Number(p.low_stock_threshold),
  ).length;

  const openAddManual = useCallback(() => {
    setAddPrefill(null);
    setAddSuggestedMatch(null);
    setAddOpen(true);
  }, []);

  const openScanner = useCallback(() => {
    setLookupError(null);
    setAddOpen(false);
    setSelected(null);
    setScannerOpen(true);
  }, []);

  const handleScanned = useCallback(
    (rawBarcode: string) => {
      const barcode = rawBarcode.trim();
      if (!barcode) return;
      setScannerOpen(false);

      const existingProduct = products.find((p) =>
        p.lots.some((l) => l.barcode === barcode),
      );
      if (existingProduct) {
        setSelected(existingProduct);
        return;
      }

      startLookup(async () => {
        let prefill: LotPrefill = { barcode };
        let suggested: ProductWithLots | null = null;
        try {
          const off = await lookupBarcode(barcode);
          if (off) {
            prefill = {
              barcode: off.barcode,
              brand: off.brand,
              image_url: off.imageUrl,
            };
            // El suggestedType de la IA es mucho mejor que el name raw para
            // matchear contra el catálogo del hogar. Si lo tenemos, lo usamos
            // primero; si no, caemos al fuzzy match con el name.
            if (off.suggestedType) {
              suggested = findClosestProductMatch(off.suggestedType, products);
            }
            if (!suggested && off.name) {
              suggested = findClosestProductMatch(off.name, products);
            }
            if (!suggested && off.category) {
              suggested =
                products.find(
                  (p) =>
                    p.category?.toLowerCase() === off.category?.toLowerCase(),
                ) ?? null;
            }
          }
        } catch (err) {
          setLookupError(
            err instanceof Error
              ? err.message
              : "No pudimos consultar Open Food Facts.",
          );
        }
        setAddPrefill(prefill);
        setAddSuggestedMatch(suggested);
        setAddOpen(true);
      });
    },
    [products],
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Inventario
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {householdName} · {filtered.length} con stock
            {lowStockCount > 0 && (
              <span className="text-warning-foreground/80">
                {" · "}
                <span className="font-medium">{lowStockCount}</span> bajo
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={openScanner}
            disabled={lookupPending}
            aria-label="Escanear código"
            className="shrink-0 size-11"
          >
            {lookupPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ScanLine className="size-5" />
            )}
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Estás en modo solo lectura. Para editar pedile al dueño del hogar
          que te cambie el rol.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Buscar por tipo, categoría o marca..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {lookupError && (
        <p
          role="alert"
          className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
        >
          {lookupError}
        </p>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          hasAnyProducts={products.some((p) => Number(p.quantity) > 0)}
          canEdit={canEdit}
          onAdd={openAddManual}
          onScan={openScanner}
        />
      ) : (
        <div className="space-y-5 animate-in fade-in duration-300">
          {grouped.map(({ department, items }) => (
            <section key={department} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-heading font-bold text-foreground">
                <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary/15 text-primary">
                  <DynamicIcon
                    name={DEPARTMENT_ICONS[department]}
                    className="size-4"
                    strokeWidth={2.2}
                  />
                </span>
                {DEPARTMENT_LABELS[department]}
                <span className="text-muted-foreground/60 font-normal text-xs">
                  ({items.length})
                </span>
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((p) => (
                  <li key={p.id}>
                    <ProductCard
                      product={p}
                      warningDays={warningDays}
                      canEdit={canEdit}
                      rate={ratesByProduct[p.id]}
                      onOpenDetail={() => {
                        setSelectedAddLot(false);
                        setSelected(p);
                      }}
                      onAddLot={() => {
                        setSelectedAddLot(true);
                        setSelected(p);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <Button
          type="button"
          size="lg"
          className="fixed bottom-24 right-4 md:bottom-8 md:right-8 size-16 rounded-full bg-primary text-primary-foreground shadow-brand-lg z-10 hover:scale-105 active:scale-95 transition-transform ring-2 ring-background"
          onClick={openAddManual}
          aria-label="Agregar producto"
        >
          <Plus className="size-6" />
        </Button>
      )}

      <AddProductSheet
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddPrefill(null);
            setAddSuggestedMatch(null);
          }
        }}
        catalog={products}
        prefill={addPrefill}
        suggestedMatch={addSuggestedMatch}
        onScanClick={openScanner}
      />

      <ProductDetailSheet
        product={selected}
        warningDays={warningDays}
        canEdit={canEdit}
        rate={selected ? ratesByProduct[selected.id] : undefined}
        initialShowAddLot={selectedAddLot}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setSelectedAddLot(false);
          }
        }}
      />

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanned}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------

function groupByDepartment(
  products: ProductWithLots[],
): Array<{ department: Department; items: ProductWithLots[] }> {
  const map = new Map<Department, ProductWithLots[]>();
  for (const p of products) {
    const d: Department = isDepartment(p.department) ? p.department : "other";
    const arr = map.get(d) ?? [];
    arr.push(p);
    map.set(d, arr);
  }
  return DEPARTMENT_ORDER.flatMap((d) => {
    const items = map.get(d);
    return items ? [{ department: d, items }] : [];
  });
}

function findClosestProductMatch(
  offName: string,
  products: ProductWithLots[],
): ProductWithLots | null {
  const offTokens = tokenize(offName);
  if (offTokens.length === 0) return null;

  let best: { product: ProductWithLots; score: number } | null = null;
  for (const p of products) {
    if (!p.is_active) continue;
    const pTokens = tokenize(p.name);
    if (pTokens.length === 0) continue;
    const shared = pTokens.filter((t) => offTokens.includes(t)).length;
    if (shared === 0) continue;
    const bonus = offName.toLowerCase().includes(p.name.toLowerCase()) ? 2 : 0;
    const score = shared + bonus;
    if (!best || score > best.score) {
      best = { product: p, score };
    }
  }

  return best && best.score >= 1 ? best.product : null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

function EmptyState({
  hasAnyProducts,
  canEdit,
  onAdd,
  onScan,
}: {
  hasAnyProducts: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onScan: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="size-24 rounded-full bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
        <ScanLine className="size-12" strokeWidth={1.8} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          {hasAnyProducts ? "Nada con stock por acá" : "Arranquemos a cargar"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {hasAnyProducts
            ? "Probá la tab 'Compras' para ver lo que solés tener pero está sin stock."
            : canEdit
              ? "Escaneá un código de barras o agregá un producto a mano para empezar."
              : "Todavía no hay nada cargado en este hogar."}
        </p>
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <Button onClick={onScan} size="lg">
            <ScanLine className="size-4" />
            Escanear
          </Button>
          <Button variant="outline" onClick={onAdd} size="lg">
            <Plus className="size-4" />
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
