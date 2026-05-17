"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNITS, UNIT_LABELS, type Location, type Unit } from "@/lib/database.types";
import {
  EMPTY_VALUE_SENTINEL,
  INITIAL_ACTION_STATE,
  type ActionState,
} from "../constants";
import type { ProductWithLocation } from "@/lib/db/products";

const NO_LOCATION_VALUE = EMPTY_VALUE_SENTINEL;

export type ProductFormDefaults = {
  name?: string;
  brand?: string;
  category?: string;
  unit?: Unit;
  quantity?: number;
  low_stock_threshold?: number;
  default_location_id?: string | null;
  barcode?: string;
  notes?: string;
};

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  locations: Location[];
  product?: ProductWithLocation;
  /** Valores iniciales para alta (ej. desde un escaneo OFF). Ignorado si hay `product`. */
  initialValues?: ProductFormDefaults;
  submitLabel: string;
  onSuccess?: () => void;
};

export function ProductForm({
  action,
  locations,
  product,
  initialValues,
  submitLabel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);

  const defaults = useMemo(() => buildDefaults(product, initialValues), [
    product,
    initialValues,
  ]);

  // Re-monta el form si cambian los defaults (ej. después de un escaneo).
  // Sin esto, los `defaultValue` no se aplican.
  const formKey = useMemo(
    () => `${product?.id ?? "new"}-${defaults.barcode}-${defaults.name}`,
    [product?.id, defaults.barcode, defaults.name],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onSuccess?.();
    }
  }, [state, router, onSuccess]);

  return (
    <form key={formKey} action={formAction} className="space-y-3">
      {product && <input type="hidden" name="id" value={product.id} />}

      <Field id="name" label="Nombre" required>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults.name}
          placeholder="Leche entera"
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="brand" label="Marca">
          <Input
            id="brand"
            name="brand"
            defaultValue={defaults.brand}
            placeholder="La Serenísima"
            autoComplete="off"
          />
        </Field>

        <Field id="category" label="Categoría">
          <Input
            id="category"
            name="category"
            defaultValue={defaults.category}
            placeholder="Lácteos"
            autoComplete="off"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="quantity" label="Cantidad">
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            defaultValue={defaults.quantity}
          />
        </Field>

        <Field id="unit" label="Unidad">
          <Select name="unit" defaultValue={defaults.unit}>
            <SelectTrigger id="unit" className="w-full">
              <SelectValue placeholder="Unidad" />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {UNIT_LABELS[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        id="low_stock_threshold"
        label="Umbral mínimo (alerta cuando queda esto o menos)"
      >
        <Input
          id="low_stock_threshold"
          name="low_stock_threshold"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          defaultValue={defaults.low_stock_threshold}
        />
      </Field>

      <Field id="default_location_id" label="Ubicación">
        <Select
          name="default_location_id"
          defaultValue={defaults.default_location_id}
        >
          <SelectTrigger id="default_location_id" className="w-full">
            <SelectValue placeholder="Elegí una ubicación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LOCATION_VALUE}>Sin asignar</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="barcode" label="Código de barras (opcional)">
        <Input
          id="barcode"
          name="barcode"
          inputMode="numeric"
          defaultValue={defaults.barcode}
          placeholder="7790070410016"
          autoComplete="off"
        />
      </Field>

      <Field id="notes" label="Notas (opcional)">
        <Input
          id="notes"
          name="notes"
          defaultValue={defaults.notes}
          placeholder="Comprar siempre la sin lactosa"
          autoComplete="off"
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>

      {state.status === "error" && (
        <p
          role="alert"
          className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function buildDefaults(
  product: ProductWithLocation | undefined,
  initial: ProductFormDefaults | undefined,
) {
  if (product) {
    return {
      name: product.name,
      brand: product.brand ?? "",
      category: product.category ?? "",
      unit: (product.unit as Unit) ?? "un",
      quantity: product.quantity,
      low_stock_threshold: product.low_stock_threshold,
      default_location_id: product.default_location_id ?? NO_LOCATION_VALUE,
      barcode: product.barcode ?? "",
      notes: product.notes ?? "",
    };
  }
  return {
    name: initial?.name ?? "",
    brand: initial?.brand ?? "",
    category: initial?.category ?? "",
    unit: initial?.unit ?? ("un" as Unit),
    quantity: initial?.quantity ?? 0,
    low_stock_threshold: initial?.low_stock_threshold ?? 1,
    default_location_id: initial?.default_location_id ?? NO_LOCATION_VALUE,
    barcode: initial?.barcode ?? "",
    notes: initial?.notes ?? "",
  };
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
