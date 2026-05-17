"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Home,
  ListPlus,
  Loader2,
  Pencil,
  ShoppingBasket,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  UNITS,
  UNIT_LABELS,
  isDepartment,
  type Department,
  type Location,
  type Unit,
} from "@/lib/database.types";
import type { ShoppingListItemWithProduct } from "@/lib/db/shopping";
import { DynamicIcon } from "@/lib/icon-map";
import {
  addCustomItemAction,
  removeListItemAction,
  setItemStateAction,
  updateListItemAction,
} from "../actions";

type Props = {
  items: ShoppingListItemWithProduct[];
  locations: Location[];
};

export function ShoppingListView({ items }: Props) {
  const grouped = useMemo(() => groupByDepartment(items), [items]);
  const pending = items.filter((i) => i.state === "pending");
  const checked = items.filter((i) => i.state === "checked");

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ShoppingListItemWithProduct | null>(
    null,
  );

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <>
          {/* Acciones superiores */}
          <div className="grid grid-cols-2 gap-2">
            {pending.length > 0 ? (
              <Link
                href="/compras/super"
                className={buttonVariants({ variant: "default", size: "lg" })}
              >
                <ShoppingBasket className="size-4" />
                Modo super
              </Link>
            ) : (
              <Button variant="default" size="lg" disabled>
                <ShoppingBasket className="size-4" />
                Modo super
              </Button>
            )}

            {checked.length > 0 ? (
              <Link
                href="/compras/cerrar"
                className={buttonVariants({ variant: "default", size: "lg" })}
              >
                <Home className="size-4" />
                Volví a casa
                <span className="ml-1 text-xs">({checked.length})</span>
              </Link>
            ) : (
              <Button variant="outline" size="lg" disabled>
                <Home className="size-4" />
                Volví a casa
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {grouped.map(({ department, items: deptItems }) => (
              <DepartmentBlock
                key={department}
                department={department}
                items={deptItems}
                onEdit={setEditing}
              />
            ))}
          </div>
        </>
      )}

      {/* FAB para item custom */}
      <Button
        type="button"
        size="lg"
        variant={items.length === 0 ? "default" : "outline"}
        onClick={() => setAddOpen(true)}
        className="w-full"
      >
        <ListPlus className="size-4" />
        Agregar item suelto
      </Button>

      <AddCustomItemSheet open={addOpen} onOpenChange={setAddOpen} />

      <EditItemSheet
        item={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
        <ShoppingBasket className="size-10 text-primary" strokeWidth={1.5} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h2 className="font-heading text-lg font-semibold">
          Lista vacía
        </h2>
        <p className="text-sm text-muted-foreground">
          Andá a la pestaña Por reponer y tocá{" "}
          <ShoppingBasket className="size-3 inline" /> A lista en lo que
          necesites, o agregá un item suelto.
        </p>
      </div>
      <Button onClick={onAdd} size="lg">
        <ListPlus className="size-4" />
        Agregar item suelto
      </Button>
    </div>
  );
}

function DepartmentBlock({
  department,
  items,
  onEdit,
}: {
  department: Department;
  items: ShoppingListItemWithProduct[];
  onEdit: (item: ShoppingListItemWithProduct) => void;
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
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <ListItemRow item={item} onEdit={() => onEdit(item)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListItemRow({
  item,
  onEdit,
}: {
  item: ShoppingListItemWithProduct;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const checked = item.state === "checked";
  const displayName = item.product?.name ?? item.custom_name ?? "(sin nombre)";
  const iconName = item.product?.icon ?? null;

  function toggleCheck() {
    startTransition(async () => {
      await setItemStateAction(item.id, checked ? "pending" : "checked");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await removeListItemAction(item.id);
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-lg border p-2.5 flex items-center gap-2.5 transition-all ${
        checked
          ? "border-border bg-muted/30 opacity-60"
          : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={toggleCheck}
        disabled={pending}
        className={`size-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
        aria-label={checked ? "Desmarcar" : "Marcar como comprado"}
      >
        {checked && <Check className="size-4" strokeWidth={3} />}
      </button>

      {iconName && (
        <DynamicIcon
          name={iconName}
          className="size-4 text-muted-foreground shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className={`text-sm ${checked ? "line-through" : ""} truncate`}>
          {displayName}
          <span className="text-muted-foreground text-xs ml-1.5">
            ×{formatQuantity(Number(item.quantity))}
            {item.unit && item.unit !== "un" && ` ${item.unit}`}
          </span>
          {!item.product && (
            <span className="ml-1 text-[10px] text-primary inline-flex items-center gap-0.5">
              <Sparkles className="size-2.5" />
              suelto
            </span>
          )}
        </div>
        {item.notes && (
          <div className="text-[11px] text-muted-foreground truncate">
            {item.notes}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className="size-7"
          disabled={pending}
          aria-label="Editar"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={remove}
          className="size-7 text-destructive hover:text-destructive"
          disabled={pending}
          aria-label="Quitar"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Add custom item
// ----------------------------------------------------------------------------

function AddCustomItemSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<Unit>("un");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setQuantity("1");
    setUnit("un");
    setNotes("");
    setError(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Necesito un nombre.");
      return;
    }
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Cantidad inválida.");
      return;
    }
    startTransition(async () => {
      const result = await addCustomItemAction({
        name: name.trim(),
        quantity: qty,
        unit,
        notes: notes.trim() || null,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      handleClose(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agregar item suelto</SheetTitle>
          <SheetDescription>
            Algo que no está en el catálogo (ej. &quot;flores para mamá&quot;).
            No se va a cargar como tipo, solo va a la lista del super.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ci-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ci-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flores"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ci-qty">Cantidad</Label>
              <Input
                id="ci-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-unit">Unidad</Label>
              <select
                id="ci-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full h-9 px-2 rounded-md border border-input bg-transparent text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ci-notes">Notas</Label>
            <Input
              id="ci-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Las amarillas si hay"
              autoComplete="off"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="w-full"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Agregar a la lista
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Edit item
// ----------------------------------------------------------------------------

function EditItemSheet({
  item,
  onOpenChange,
}: {
  item: ShoppingListItemWithProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Estado del form derivado del item. Reset cuando cambia.
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [customName, setCustomName] = useState("");

  const itemKey = item?.id ?? null;
  const [previousKey, setPreviousKey] = useState(itemKey);
  if (previousKey !== itemKey) {
    setPreviousKey(itemKey);
    setQuantity(item ? String(item.quantity) : "1");
    setNotes(item?.notes ?? "");
    setCustomName(item?.custom_name ?? "");
    setError(null);
  }

  function handleSubmit() {
    if (!item) return;
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Cantidad inválida.");
      return;
    }
    startTransition(async () => {
      const result = await updateListItemAction(item.id, {
        quantity: qty,
        notes: notes.trim() || null,
        custom_name: item.product_id ? undefined : customName.trim() || null,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading text-lg pr-8 flex items-center justify-between gap-2">
                <span className="truncate">
                  Editar {item.product?.name ?? item.custom_name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  aria-label="Cerrar"
                  className="size-7"
                >
                  <X className="size-4" />
                </Button>
              </SheetTitle>
            </SheetHeader>

            <div className="px-4 pb-6 space-y-3">
              {!item.product_id && (
                <div className="space-y-1.5">
                  <Label htmlFor="ei-name">Nombre</Label>
                  <Input
                    id="ei-name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="ei-qty">Cantidad</Label>
                <Input
                  id="ei-qty"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ei-notes">Notas</Label>
                <Input
                  id="ei-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Marca preferida, tamaño, etc."
                  autoComplete="off"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
                >
                  {error}
                </p>
              )}

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="w-full"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

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
