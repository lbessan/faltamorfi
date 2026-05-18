"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Hourglass,
  ListChecks,
  Loader2,
  Plus,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  formatDaysLeft,
  predictDaysLeft,
  type ConsumptionRate,
} from "@/lib/db/predictions";
import { DynamicIcon } from "@/lib/icon-map";
import { LotForm } from "@/app/(app)/inventario/_components/lot-form";
import { addProductToListAction } from "../actions";

type Props = {
  restock: ProductWithLocation[];
  lowStock: ProductWithLocation[];
  runningOut: ProductWithLocation[];
  productsInList: Set<string>;
  locations: Location[];
  canEdit: boolean;
  ratesByProduct: Record<string, ConsumptionRate>;
};

export function RestockView({
  restock,
  lowStock,
  runningOut,
  productsInList,
  locations,
  canEdit,
  ratesByProduct,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ProductWithLocation | null>(null);
  const [, startTransition] = useTransition();
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);

  const groupedRestock = useMemo(() => groupByDepartment(restock), [restock]);
  const groupedLow = useMemo(() => groupByDepartment(lowStock), [lowStock]);
  const groupedRunningOut = useMemo(
    () => groupByDepartment(runningOut),
    [runningOut],
  );

  const total = restock.length + lowStock.length + runningOut.length;

  function addToList(
    product: ProductWithLocation,
    source: "restock" | "low_stock" | "manual",
  ) {
    setPendingProduct(product.id);
    startTransition(async () => {
      await addProductToListAction(product.id, 1, source);
      router.refresh();
      setPendingProduct(null);
    });
  }

  return (
    <div className="space-y-6">
      {total === 0 && <CelebrateEmpty />}

      {restock.length > 0 && (
        <div className="space-y-4">
          {groupedRestock.map(({ department, items }) => (
            <DepartmentBlock
              key={`out-${department}`}
              department={department}
              items={items}
              variant="out"
              productsInList={productsInList}
              pendingProduct={pendingProduct}
              canEdit={canEdit}
              ratesByProduct={ratesByProduct}
              onPickLot={setActive}
              onAddToList={(p) => addToList(p, "restock")}
            />
          ))}
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="space-y-4">
          {restock.length > 0 && <div className="border-t border-border pt-4" />}
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
              productsInList={productsInList}
              pendingProduct={pendingProduct}
              canEdit={canEdit}
              ratesByProduct={ratesByProduct}
              onPickLot={setActive}
              onAddToList={(p) => addToList(p, "low_stock")}
            />
          ))}
        </div>
      )}

      {runningOut.length > 0 && (
        <div className="space-y-4">
          {(restock.length > 0 || lowStock.length > 0) && (
            <div className="border-t border-border pt-4" />
          )}
          <div>
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <Hourglass className="size-4 text-primary" />
              Se va a acabar pronto
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Según tu consumo histórico, te dura ~1 semana o menos.
            </p>
          </div>
          {groupedRunningOut.map(({ department, items }) => (
            <DepartmentBlock
              key={`running-${department}`}
              department={department}
              items={items}
              variant="running"
              productsInList={productsInList}
              pendingProduct={pendingProduct}
              canEdit={canEdit}
              ratesByProduct={ratesByProduct}
              onPickLot={setActive}
              onAddToList={(p) => addToList(p, "low_stock")}
            />
          ))}
        </div>
      )}

      {/* Sheet para cargar un lote directo del producto elegido */}
      <Sheet
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="font-heading text-xl">
                  Cargar {active.name}
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

type Variant = "out" | "low" | "running";

function DepartmentBlock({
  department,
  items,
  variant,
  productsInList,
  pendingProduct,
  canEdit,
  ratesByProduct,
  onPickLot,
  onAddToList,
}: {
  department: Department;
  items: ProductWithLocation[];
  variant: Variant;
  productsInList: Set<string>;
  pendingProduct: string | null;
  canEdit: boolean;
  ratesByProduct: Record<string, ConsumptionRate>;
  onPickLot: (p: ProductWithLocation) => void;
  onAddToList: (p: ProductWithLocation) => void;
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
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id}>
            <RestockRow
              product={p}
              variant={variant}
              inList={productsInList.has(p.id)}
              pending={pendingProduct === p.id}
              canEdit={canEdit}
              rate={ratesByProduct[p.id]}
              onPickLot={() => onPickLot(p)}
              onAddToList={() => onAddToList(p)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RestockRow({
  product,
  variant,
  inList,
  pending,
  canEdit,
  rate,
  onPickLot,
  onAddToList,
}: {
  product: ProductWithLocation;
  variant: Variant;
  inList: boolean;
  pending: boolean;
  canEdit: boolean;
  rate?: ConsumptionRate;
  onPickLot: () => void;
  onAddToList: () => void;
}) {
  const prediction = predictDaysLeft(rate, Number(product.quantity));

  const borderClass =
    variant === "low"
      ? "border-warning/30 bg-warning/5"
      : variant === "running"
        ? "border-primary/30 bg-primary/5"
        : "border-border bg-card";

  return (
    <div
      className={`rounded-xl border p-3 flex items-center gap-3 ${borderClass}`}
    >
      <div
        className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
          variant === "low"
            ? "bg-warning/20"
            : variant === "running"
              ? "bg-primary/15"
              : "bg-muted"
        }`}
      >
        <DynamicIcon
          name={product.icon}
          className={`size-5 ${
            variant === "low"
              ? "text-warning-foreground"
              : variant === "running"
                ? "text-primary"
                : "text-muted-foreground"
          }`}
          strokeWidth={1.7}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{product.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {variant === "running" && prediction.daysLeft !== null
            ? `${formatQuantity(Number(product.quantity))} · ${formatDaysLeft(prediction.daysLeft).toLowerCase()}`
            : variant === "low"
              ? `${formatQuantity(Number(product.quantity))} restante`
              : "Sin stock"}
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          {inList ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary px-2 py-1">
              <Check className="size-3.5" />
              En lista
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onAddToList}
              disabled={pending}
              className="h-8"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShoppingBasket className="size-3.5" />
              )}
              A lista
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onPickLot}
            aria-label="Cargar lote ya"
            className="size-8"
            title="Ya lo tengo, cargar lote"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
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
