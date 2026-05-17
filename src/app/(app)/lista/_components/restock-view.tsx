"use client";

import { useMemo, useState } from "react";
import { ListChecks, Plus, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  isDepartment,
  type Department,
  type Location,
} from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import { DynamicIcon } from "@/lib/icon-map";
import { LotForm } from "@/app/(app)/inventario/_components/lot-form";

type Props = {
  restock: ProductWithLocation[];
  lowStock: ProductWithLocation[];
  locations: Location[];
};

export function RestockView({ restock, lowStock, locations }: Props) {
  const [active, setActive] = useState<ProductWithLocation | null>(null);

  const groupedRestock = useMemo(() => groupByDepartment(restock), [restock]);
  const groupedLow = useMemo(() => groupByDepartment(lowStock), [lowStock]);

  const total = restock.length + lowStock.length;

  return (
    <div className="px-4 py-4 space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Por reponer
        </h1>
        <p className="text-sm text-muted-foreground">
          Tipos que solés tener pero ahora están sin stock o con poco. Tap para
          cargar un lote.
        </p>
      </div>

      {total === 0 && <CelebrateEmpty />}

      {restock.length > 0 && (
        <div className="space-y-4">
          {groupedRestock.map(({ department, items }) => (
            <DepartmentBlock
              key={`out-${department}`}
              department={department}
              items={items}
              variant="out"
              onPick={setActive}
            />
          ))}
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="space-y-4">
          <div className="border-t border-border pt-4" />
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-warning" />
            Con poco stock
          </h2>
          {groupedLow.map(({ department, items }) => (
            <DepartmentBlock
              key={`low-${department}`}
              department={department}
              items={items}
              variant="low"
              onPick={setActive}
            />
          ))}
        </div>
      )}

      {/* Sheet para cargar un lote del producto elegido */}
      <Sheet
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading text-xl">
                  Reponer {active.name}
                </SheetTitle>
                <SheetDescription>
                  Cargá la cantidad y el vencimiento del lote nuevo.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <LotForm
                  productId={active.id}
                  productName={active.name}
                  productCategory={active.category}
                  locations={locations}
                  defaultLocationId={active.default_location_id}
                  onClose={() => setActive(null)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ----------------------------------------------------------------------------

function DepartmentBlock({
  department,
  items,
  variant,
  onPick,
}: {
  department: Department;
  items: ProductWithLocation[];
  variant: "out" | "low";
  onPick: (p: ProductWithLocation) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <DynamicIcon
          name={DEPARTMENT_ICONS[department]}
          className="size-4"
          strokeWidth={2}
        />
        {DEPARTMENT_LABELS[department]}
        <span className="text-muted-foreground/60 normal-case">
          ({items.length})
        </span>
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className={`w-full h-full rounded-xl border bg-card p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-all ${
                variant === "low"
                  ? "border-warning/30 hover:bg-warning/5"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              <div
                className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
                  variant === "low" ? "bg-warning/20" : "bg-muted"
                }`}
              >
                <DynamicIcon
                  name={p.icon}
                  className={`size-5 ${variant === "low" ? "text-warning-foreground" : "text-muted-foreground"}`}
                  strokeWidth={1.7}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {variant === "low"
                    ? `${formatQuantity(Number(p.quantity))} restante`
                    : "Sin stock"}
                </div>
              </div>
              <Plus className="size-4 text-muted-foreground shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CelebrateEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
        <ListChecks className="size-10 text-primary" strokeWidth={1.5} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h2 className="font-heading text-lg font-semibold">Todo en orden</h2>
        <p className="text-sm text-muted-foreground">
          Tus tipos habituales tienen stock y nada está bajo umbral. Cuando algo
          se agote o quede poco, lo vas a ver acá.
        </p>
      </div>
    </div>
  );
}

function groupByDepartment(
  products: ProductWithLocation[],
): Array<{ department: Department; items: ProductWithLocation[] }> {
  const map = new Map<Department, ProductWithLocation[]>();
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

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
