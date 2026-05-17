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
import type { ProductFormDefaults } from "./product-form";

const ALL_LOCATIONS_VALUE = "__all__";
const NO_LOCATION_VALUE = "__none__";

type Props = {
  householdName: string;
  locations: Location[];
  products: ProductWithLocation[];
};

export function InventoryView({ householdName, locations, products }: Props) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>(
    ALL_LOCATIONS_VALUE,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<ProductFormDefaults | null>(null);
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
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q)
      );
    });
  }, [products, query, locationFilter]);

  const lowStockCount = products.filter(
    (p) => Number(p.quantity) <= Number(p.low_stock_threshold),
  ).length;

  const openAddManual = useCallback(() => {
    setAddPrefill(null);
    setAddOpen(true);
  }, []);

  const openScanner = useCallback(() => {
    setLookupError(null);
    // Si el add sheet está abierto cuando piden escanear, lo cerramos
    // antes — los sheets bottom no se pueden apilar limpiamente.
    setAddOpen(false);
    setSelected(null);
    setScannerOpen(true);
  }, []);

  const handleScanned = useCallback(
    (rawBarcode: string) => {
      const barcode = rawBarcode.trim();
      if (!barcode) return;
      setScannerOpen(false);

      const existing = products.find((p) => p.barcode === barcode);
      if (existing) {
        setSelected(existing);
        return;
      }

      startLookup(async () => {
        let prefill: ProductFormDefaults = { barcode };
        try {
          const off = await lookupBarcode(barcode);
          if (off) {
            prefill = {
              barcode: off.barcode,
              name: off.name ?? "",
              brand: off.brand ?? "",
              category: off.category ?? "",
              image_url: off.imageUrl,
            };
          }
        } catch (err) {
          setLookupError(
            err instanceof Error
              ? err.message
              : "No pudimos consultar Open Food Facts.",
          );
        }
        setAddPrefill(prefill);
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
                <span className="font-medium">{lowStockCount}</span> con stock bajo
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
          placeholder="Buscar por nombre, marca, categoría o código..."
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
              <ProductCard product={p} onClick={() => setSelected(p)} />
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
          if (!open) setAddPrefill(null);
        }}
        locations={locations}
        prefill={addPrefill}
        onScanClick={openScanner}
      />

      <ProductDetailSheet
        product={selected}
        locations={locations}
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
