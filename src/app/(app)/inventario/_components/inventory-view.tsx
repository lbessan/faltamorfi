"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Location } from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import { ProductCard } from "./product-card";
import { AddProductSheet } from "./add-product-sheet";
import { ProductDetailSheet } from "./product-detail-sheet";

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
  const [selected, setSelected] = useState<ProductWithLocation | null>(null);

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

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground">
          {householdName} · {products.length} productos
          {lowStockCount > 0 && (
            <span className="text-destructive">
              {" · "}
              {lowStockCount} con stock bajo
            </span>
          )}
        </p>
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

      {filtered.length === 0 ? (
        <EmptyState
          hasProducts={products.length > 0}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <ul className="flex flex-col gap-2">
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
        className="fixed bottom-20 right-4 size-14 rounded-full shadow-lg z-10"
        onClick={() => setAddOpen(true)}
        aria-label="Agregar producto"
      >
        <Plus className="size-6" />
      </Button>

      <AddProductSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        locations={locations}
      />

      <ProductDetailSheet
        product={selected}
        locations={locations}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function EmptyState({
  hasProducts,
  onAdd,
}: {
  hasProducts: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-muted-foreground">
        {hasProducts
          ? "No hay productos que coincidan con el filtro."
          : "Todavía no cargaste nada. Agregá tu primer producto."}
      </p>
      {!hasProducts && (
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          Agregar producto
        </Button>
      )}
    </div>
  );
}
