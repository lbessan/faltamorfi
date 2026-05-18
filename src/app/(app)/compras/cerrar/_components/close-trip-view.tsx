"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Home,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  isDepartment,
  type Department,
} from "@/lib/database.types";
import type { ShoppingListItemWithProduct } from "@/lib/db/shopping";
import { DynamicIcon } from "@/lib/icon-map";
import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";
import { closeTripAction, removeListItemAction } from "../../actions";

type Props = {
  householdId: string;
  items: ShoppingListItemWithProduct[];
};

export function CloseTripView({ householdId, items }: Props) {
  useRealtimeRefresh({
    tables: [
      {
        table: "shopping_list_items",
        filter: `household_id=eq.${householdId}`,
      },
    ],
  });

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { catalogItems, customItems } = useMemo(() => {
    const cat: ShoppingListItemWithProduct[] = [];
    const cus: ShoppingListItemWithProduct[] = [];
    for (const i of items) {
      if (i.product_id) cat.push(i);
      else cus.push(i);
    }
    return { catalogItems: cat, customItems: cus };
  }, [items]);

  const grouped = useMemo(() => groupByDepartment(catalogItems), [catalogItems]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await closeTripAction();
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push("/inventario");
    });
  }

  function removeCustom(id: string) {
    startTransition(async () => {
      await removeListItemAction(id);
      router.refresh();
    });
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href="/compras"
            aria-label="Volver"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg font-bold leading-tight">
              Volví a casa
            </h1>
            <p className="text-xs text-muted-foreground">
              Revisá lo que se carga al inventario.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-5 pb-32">
        {catalogItems.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-2">
              <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  Se va a cargar un lote por cada item.
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sin vencimiento ni marca. Después podés editar cada lote
                  desde el inventario para sumarles esos datos.
                </p>
              </div>
            </div>

            {grouped.map(({ department, items: deptItems }) => (
              <DepartmentBlock
                key={department}
                department={department}
                items={deptItems}
              />
            ))}
          </div>
        )}

        {customItems.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
              <TriangleAlert className="size-4 text-warning-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  Items sueltos ({customItems.length})
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No están en el catálogo, así que no se cargan automáticamente.
                  Si los compraste, podés quitarlos de la lista (la próxima vez
                  podés crear el tipo desde Inventario).
                </p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {customItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2.5"
                >
                  <Sparkles className="size-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.custom_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatQuantity(Number(item.quantity))} {item.unit}
                      {item.notes && ` · ${item.notes}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCustom(item.id)}
                    disabled={pending}
                    aria-label="Quitar de la lista"
                    className="size-7 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}
      </div>

      {/* Footer fijo con acción primaria */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t border-border z-10">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Link
            href="/compras"
            aria-disabled={pending}
            className={buttonVariants({ variant: "outline", size: "lg" }) + " flex-1"}
          >
            Cancelar
          </Link>
          <Button
            type="button"
            size="lg"
            className="flex-1"
            onClick={handleConfirm}
            disabled={pending || catalogItems.length === 0}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Home className="size-4" />
            )}
            Confirmar
            {catalogItems.length > 0 && (
              <span className="text-xs">({catalogItems.length})</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DepartmentBlock({
  department,
  items,
}: {
  department: Department;
  items: ShoppingListItemWithProduct[];
}) {
  return (
    <section className="space-y-2">
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
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2.5"
          >
            <DynamicIcon
              name={item.product?.icon}
              className="size-4 text-muted-foreground shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{item.product?.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatQuantity(Number(item.quantity))} {item.unit}
                {item.notes && ` · ${item.notes}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function groupByDepartment(
  items: ShoppingListItemWithProduct[],
): Array<{ department: Department; items: ShoppingListItemWithProduct[] }> {
  const map = new Map<Department, ShoppingListItemWithProduct[]>();
  for (const item of items) {
    const d: Department = isDepartment(item.product?.department)
      ? (item.product?.department as Department)
      : "other";
    const arr = map.get(d) ?? [];
    arr.push(item);
    map.set(d, arr);
  }
  return DEPARTMENT_ORDER.flatMap((d) => {
    const arr = map.get(d);
    return arr ? [{ department: d, items: arr }] : [];
  });
}

function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
