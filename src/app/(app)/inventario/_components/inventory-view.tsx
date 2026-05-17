"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, ScanLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Location } from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import { lookupBarcode } from "@/lib/openfoodfacts";
import { BarcodeScannerSheet } from "@/components/barcode-scanner";
import { ProductCard } from "./product-card";
import { AddProductSheet } from "./add-product-sheet";
import { ProductDetailSheet } from "./product-detail-sheet";
import type { LotPrefill } from "./lot-form";

const ALL_LOCATIONS_VALUE = "__all__";
const NO_LOCATION_VALUE = "__none__";

type Props = {
  householdName: string;
  locations: Location[];
  products: ProductWithLocation[];
  warningDays: number;
};

export function InventoryView({
  householdName,
  locations,
  products,
  warningDays,
}: Props) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>(
    ALL_LOCATIONS_VALUE,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<LotPrefill | null>(null);
  const [addSuggestedMatch, setAddSuggestedMatch] =
    useState<ProductWithLocation | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<ProductWithLocation | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [lookupError, setLookupError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (
        locationFilter !== ALL_LOCATIONS_VALUE &&
        ((locationFilter === NO_LOCATION_VALUE &&
          p.default_location_id !== null) ||
          (locationFilter !== NO_LOCATION_VALUE &&
            p.default_location_id !== locationFilter))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        // Buscamos también en marca/código de cada lote.
        p.lots.some(
          (l) =>
            (l.brand ?? "").toLowerCase().includes(q) ||
            (l.image_url == null && false), // no-op para mantener forma
        )
      );
    });
  }, [products, query, locationFilter]);

  const lowStockCount = products.filter(
    (p) => Number(p.quantity) <= Number(p.low_stock_threshold),
  ).length;

  const openAddManual = useCallback(() => {
    setAddPrefill(null);
    setAddSuggestedMatch(null);
    setAddOpen(true);
  }, []);

  const openScanner = useCallback(() => {
    setLookupError(null);
    // Si el add sheet está abierto, lo cerramos antes (no podemos anidar sheets).
    setAddOpen(false);
    setSelected(null);
    setScannerOpen(true);
  }, []);

  const handleScanned = useCallback(
    (rawBarcode: string) => {
      const barcode = rawBarcode.trim();
      if (!barcode) return;
      setScannerOpen(false);

      // 1) ¿El barcode ya existe en algún lote del hogar?
      const existingProduct = products.find((p) =>
        p.lots.some((l) => l.barcode === barcode),
      );
      if (existingProduct) {
        setSelected(existingProduct);
        return;
      }

      // 2) Lookup OFF + buscar match por nombre
      startLookup(async () => {
        let prefill: LotPrefill = { barcode };
        let suggested: ProductWithLocation | null = null;
        try {
          const off = await lookupBarcode(barcode);
          if (off) {
            prefill = {
              barcode: off.barcode,
              brand: off.brand,
              image_url: off.imageUrl,
            };
            // Match heurístico contra los tipos existentes
            if (off.name) {
              suggested = findClosestProductMatch(off.name, products);
            }
            if (!suggested && off.category) {
              // Como fallback: matchear por categoría
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
            {householdName} · {products.length} productos
            {lowStockCount > 0 && (
              <span className="text-warning-foreground/80">
                {" · "}
                <span className="font-medium">{lowStockCount}</span> con stock
                bajo
              </span>
            )}
          </p>
        </div>
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
      </div>

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

      <Tabs value={locationFilter} onValueChange={setLocationFilter}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value={ALL_LOCATIONS_VALUE}>Todos</TabsTrigger>
          {locations.map((loc) => (
            <TabsTrigger key={loc.id} value={loc.id}>
              {loc.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value={NO_LOCATION_VALUE}>Sin ubicación</TabsTrigger>
        </TabsList>
      </Tabs>

      {lookupError && (
        <p
          role="alert"
          className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
        >
          {lookupError}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          hasProducts={products.length > 0}
          onAdd={openAddManual}
          onScan={openScanner}
        />
      ) : (
        <ul className="flex flex-col gap-2 animate-in fade-in duration-300">
          {filtered.map((p) => (
            <li key={p.id}>
              <ProductCard
                product={p}
                warningDays={warningDays}
                onClick={() => setSelected(p)}
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        size="lg"
        className="fixed bottom-20 right-4 size-14 rounded-full shadow-xl shadow-primary/30 z-10 hover:scale-105 active:scale-95 transition-transform"
        onClick={openAddManual}
        aria-label="Agregar producto"
      >
        <Plus className="size-6" />
      </Button>

      <AddProductSheet
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddPrefill(null);
            setAddSuggestedMatch(null);
          }
        }}
        locations={locations}
        prefill={addPrefill}
        suggestedMatch={addSuggestedMatch}
        onScanClick={openScanner}
      />

      <ProductDetailSheet
        product={selected}
        locations={locations}
        warningDays={warningDays}
        onOpenChange={(open) => !open && setSelected(null)}
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
// Match heurístico de nombres.
//
// Estrategia simple: comparar tokens. Si el producto existente comparte 1+
// tokens significativos (>= 4 chars) con el nombre de OFF, lo consideramos
// match. Devuelve el de mejor score.
// ----------------------------------------------------------------------------

function findClosestProductMatch(
  offName: string,
  products: ProductWithLocation[],
): ProductWithLocation | null {
  const offTokens = tokenize(offName);
  if (offTokens.length === 0) return null;

  let best: { product: ProductWithLocation; score: number } | null = null;
  for (const p of products) {
    const pTokens = tokenize(p.name);
    if (pTokens.length === 0) continue;
    const shared = pTokens.filter((t) => offTokens.includes(t)).length;
    if (shared === 0) continue;
    // Bonus si el nombre del producto está completamente contenido en el de OFF.
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
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

function EmptyState({
  hasProducts,
  onAdd,
  onScan,
}: {
  hasProducts: boolean;
  onAdd: () => void;
  onScan: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
        <ScanLine className="size-10 text-primary" strokeWidth={1.5} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h2 className="font-heading text-lg font-semibold">
          {hasProducts ? "Nada por acá" : "Arranquemos a cargar"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {hasProducts
            ? "Cambiá el filtro o la búsqueda para encontrar lo que buscás."
            : "Escaneá un código de barras o agregá un producto a mano para empezar."}
        </p>
      </div>
      {!hasProducts && (
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
