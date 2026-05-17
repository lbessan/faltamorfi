"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  isDepartment,
  type Department,
} from "@/lib/database.types";
import type { Product } from "@/lib/database.types";
import { DynamicIcon } from "@/lib/icon-map";
import { setProductActiveAction } from "@/app/(app)/inventario/actions";

type Props = {
  products: Product[];
};

export function TypesSettings({ products }: Props) {
  const grouped = useMemo(() => groupByDepartment(products), [products]);

  const activeCount = products.filter((p) => p.is_active).length;
  const total = products.length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tipos de producto
        </h2>
        <span className="text-xs text-muted-foreground">
          {activeCount} de {total} activos
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {grouped.map(({ department, items }) => (
          <DepartmentGroup
            key={department}
            department={department}
            items={items}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground/80 px-1 pt-1">
        Desactivar oculta el tipo del inventario y de la lista &quot;Por
        reponer&quot; sin perder sus datos. Lo podés reactivar cuando quieras.
      </p>
    </section>
  );
}

function DepartmentGroup({
  department,
  items,
}: {
  department: Department;
  items: Product[];
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = items.filter((p) => p.is_active).length;

  return (
    <div>
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
        <DynamicIcon
          name={DEPARTMENT_ICONS[department]}
          className="size-4 text-muted-foreground shrink-0"
        />
        <span className="text-sm font-medium flex-1 text-left">
          {DEPARTMENT_LABELS[department]}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {activeCount} / {items.length}
        </span>
      </button>
      {expanded && (
        <ul className="divide-y divide-border border-t border-border bg-muted/20 animate-in fade-in duration-200">
          {items.map((p) => (
            <TypeRow key={p.id} product={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeRow({ product }: { product: Product }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic UI: cambiamos visualmente apenas se toca, sin esperar al server.
  const [active, setActive] = useState(product.is_active);

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, next);
      if (result.status === "error") {
        setActive(!next); // revert
      }
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-2 flex items-center gap-3">
      <DynamicIcon
        name={product.icon}
        className="size-4 text-muted-foreground shrink-0"
      />
      <span
        className={`text-sm flex-1 truncate ${
          active ? "" : "text-muted-foreground line-through"
        }`}
      >
        {product.name}
      </span>
      <Button
        type="button"
        size="sm"
        variant={active ? "outline" : "ghost"}
        onClick={toggle}
        disabled={pending}
        className="h-7 px-2 text-xs"
      >
        {pending && <Loader2 className="size-3 animate-spin" />}
        {active ? "Activo" : "Inactivo"}
      </Button>
    </li>
  );
}

function groupByDepartment(
  products: Product[],
): Array<{ department: Department; items: Product[] }> {
  const map = new Map<Department, Product[]>();
  for (const p of products) {
    const d: Department = isDepartment(p.department) ? p.department : "other";
    const arr = map.get(d) ?? [];
    arr.push(p);
    map.set(d, arr);
  }
  // Ordenamos por nombre dentro de cada departamento
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  return DEPARTMENT_ORDER.flatMap((d) => {
    const items = map.get(d);
    return items ? [{ department: d, items }] : [];
  });
}
