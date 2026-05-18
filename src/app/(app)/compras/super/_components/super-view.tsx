"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Home, Sparkles } from "lucide-react";
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
import { setItemStateAction } from "../../actions";

type Props = {
  householdId: string;
  items: ShoppingListItemWithProduct[];
};

export function SuperView({ householdId, items }: Props) {
  // Si otro miembro está marcando items en paralelo, los vemos al instante.
  useRealtimeRefresh({
    tables: [
      {
        table: "shopping_list_items",
        filter: `household_id=eq.${householdId}`,
      },
    ],
  });

  const grouped = useMemo(() => groupByDepartment(items), [items]);
  const total = items.length;
  const checked = items.filter((i) => i.state === "checked").length;
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* Header sticky simplificado para uso en mano */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/compras"
            aria-label="Volver"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg font-bold leading-tight">
              En el super
            </h1>
            <p className="text-xs text-muted-foreground">
              {checked} de {total} · {pct}%
            </p>
          </div>
          {checked > 0 ? (
            <Link
              href="/compras/cerrar"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              <Home className="size-4" />
              Volví
            </Link>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <Home className="size-4" />
              Volví
            </Button>
          )}
        </div>
        {/* Barra de progreso */}
        <div className="h-1 bg-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-6">
        {grouped.map(({ department, items: deptItems }) => (
          <DepartmentBlock
            key={department}
            department={department}
            items={deptItems}
          />
        ))}
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
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <DynamicIcon
          name={DEPARTMENT_ICONS[department]}
          className="size-5"
          strokeWidth={2}
        />
        {DEPARTMENT_LABELS[department]}
        <span className="text-muted-foreground/60 normal-case">
          ({items.filter((i) => i.state === "pending").length} pendiente
          {items.filter((i) => i.state === "pending").length === 1 ? "" : "s"})
        </span>
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <SuperItemRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuperItemRow({ item }: { item: ShoppingListItemWithProduct }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const checked = item.state === "checked";
  const displayName = item.product?.name ?? item.custom_name ?? "(sin nombre)";

  function toggle() {
    startTransition(async () => {
      await setItemStateAction(item.id, checked ? "pending" : "checked");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all active:scale-[0.99] ${
        checked
          ? "border-primary/20 bg-primary/5 opacity-70"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div
        className={`size-10 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30"
        }`}
      >
        {checked && <Check className="size-6" strokeWidth={3} />}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`text-base font-medium ${checked ? "line-through" : ""}`}
        >
          {displayName}
          {!item.product && (
            <Sparkles className="size-3 inline ml-1 text-primary" />
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatQuantity(Number(item.quantity))} {item.unit}
          {item.notes && ` · ${item.notes}`}
        </div>
      </div>
    </button>
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
