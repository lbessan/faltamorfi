"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Loader2,
  Package,
  Plus,
  ScanLine,
  Sparkles,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  UNITS,
  UNIT_LABELS,
  type Location,
  type Unit,
} from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import {
  addLotAction,
  createProductWithLotAction,
  type LotInput,
} from "../actions";
import { EMPTY_VALUE_SENTINEL } from "../constants";
import type { LotPrefill } from "./lot-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  /** Datos prellenados (típicamente desde Open Food Facts via escaneo). */
  prefill?: LotPrefill | null;
  /** Si hay un producto existente que matchea por nombre/categoría, lo sugerimos. */
  suggestedMatch?: ProductWithLocation | null;
  /** Si está definido, mostramos botón "Escanear código de barras". */
  onScanClick?: () => void;
};

type Mode =
  | { kind: "create" } // crear tipo nuevo + primer lote
  | { kind: "addToExisting"; product: ProductWithLocation }; // sumar lote a un tipo existente

export function AddProductSheet({
  open,
  onOpenChange,
  locations,
  prefill,
  suggestedMatch,
  onScanClick,
}: Props) {
  // Si hay un suggested match, arrancamos en modo "agregar a existente".
  const initialMode: Mode = suggestedMatch
    ? { kind: "addToExisting", product: suggestedMatch }
    : { kind: "create" };

  const [mode, setMode] = useState<Mode>(initialMode);

  // Reset cuando cambia el suggested match o el prefill (re-key reset).
  const resetKey = `${suggestedMatch?.id ?? "none"}-${prefill?.barcode ?? "none"}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setMode(initialMode);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode.kind === "addToExisting"
              ? `Sumar lote a ${mode.product.name}`
              : prefill?.barcode
                ? "Producto escaneado"
                : "Cargar producto"}
          </SheetTitle>
          <SheetDescription>
            {mode.kind === "addToExisting"
              ? "Estás agregando otro lote del mismo tipo."
              : "Definí el tipo y cargá el primer lote en una sola pantalla."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {/* Sugerencia de tipo existente */}
          {suggestedMatch && (
            <MatchSwitcher
              match={suggestedMatch}
              mode={mode}
              onChoose={setMode}
            />
          )}

          {/* Escaneo desde el sheet (cierra el sheet para no anidar) */}
          {onScanClick && mode.kind === "create" && !prefill?.barcode && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onScanClick}
            >
              <ScanLine className="size-4" />
              Escanear código de barras
            </Button>
          )}

          {/* Preview de info OFF */}
          {prefill?.image_url && (
            <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
              <div className="relative size-14 rounded-md overflow-hidden bg-background shrink-0">
                <Image
                  src={prefill.image_url}
                  alt={prefill.brand ?? "Producto"}
                  fill
                  sizes="56px"
                  className="object-contain"
                />
              </div>
              <div className="text-xs text-muted-foreground min-w-0">
                <div className="text-foreground truncate">
                  {prefill.brand ?? "Sin marca"}
                </div>
                {prefill.barcode && (
                  <div className="font-mono truncate">{prefill.barcode}</div>
                )}
                <div className="text-[10px] inline-flex items-center gap-1 text-primary mt-0.5">
                  <Sparkles className="size-3" />
                  Datos de Open Food Facts
                </div>
              </div>
            </div>
          )}

          {mode.kind === "create" ? (
            <CreateForm
              locations={locations}
              prefill={prefill}
              onSuccess={() => onOpenChange(false)}
            />
          ) : (
            <AddLotToExistingForm
              product={mode.product}
              locations={locations}
              prefill={prefill}
              onSuccess={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

function MatchSwitcher({
  match,
  mode,
  onChoose,
}: {
  match: ProductWithLocation;
  mode: Mode;
  onChoose: (mode: Mode) => void;
}) {
  const isUsingExisting = mode.kind === "addToExisting";
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="text-sm">
        <Sparkles className="size-3.5 inline mr-1 text-primary" />
        Ya tenés un tipo similar:{" "}
        <span className="font-medium text-foreground">{match.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={isUsingExisting ? "default" : "outline"}
          onClick={() => onChoose({ kind: "addToExisting", product: match })}
        >
          <Plus className="size-3.5" />
          Sumar al existente
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!isUsingExisting ? "default" : "outline"}
          onClick={() => onChoose({ kind: "create" })}
        >
          <Package className="size-3.5" />
          Crear tipo nuevo
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CreateForm: crear tipo + primer lote
// ----------------------------------------------------------------------------

function CreateForm({
  locations,
  prefill,
  onSuccess,
}: {
  locations: Location[];
  prefill?: LotPrefill | null;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Tipo
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState<Unit>("un");
  const [threshold, setThreshold] = useState("1");
  const [defaultLocationId, setDefaultLocationId] = useState<string>(
    locations[0]?.id ?? EMPTY_VALUE_SENTINEL,
  );

  // Primer lote
  const [quantity, setQuantity] = useState("1");
  const [expiresOn, setExpiresOn] = useState<string>(
    prefill?.expires_on ?? "",
  );
  const [brand, setBrand] = useState<string>(prefill?.brand ?? "");
  const [barcode, setBarcode] = useState<string>(prefill?.barcode ?? "");

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Ponele un nombre al tipo (ej. 'Leche').");
      return;
    }
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    const lotLocation =
      defaultLocationId === EMPTY_VALUE_SENTINEL ? null : defaultLocationId;

    startTransition(async () => {
      const result = await createProductWithLotAction({
        product: {
          name: name.trim(),
          category: category.trim() || null,
          unit,
          low_stock_threshold: Number(threshold.replace(",", ".")) || 1,
          default_location_id: lotLocation,
          notes: null,
        },
        lot: {
          quantity: qty,
          location_id: lotLocation,
          expires_on: expiresOn || null,
          frozen_at: null,
          frozen_max_days: null,
          opened_at: null,
          opened_max_days: null,
          brand: brand.trim() || null,
          barcode: barcode.trim() || null,
          image_url: prefill?.image_url ?? null,
          notes: null,
        },
      });

      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onSuccess();
    });
  }

  return (
    <div className="space-y-3">
      {/* Tipo */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tipo de producto
        </legend>

        <div className="space-y-1.5">
          <Label htmlFor="ap-name">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ap-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leche"
            autoComplete="off"
            required
          />
          {prefill?.brand && (
            <p className="text-[11px] text-muted-foreground">
              Sugerencia: si la marca escaneada es{" "}
              <span className="font-medium">{prefill.brand}</span>, podrías
              ponerle solo el tipo genérico (ej. Leche).
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ap-category">Categoría</Label>
          <Input
            id="ap-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Lácteos"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-unit">Unidad</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
              <SelectTrigger id="ap-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-threshold">Mínimo</Label>
            <Input
              id="ap-threshold"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ap-default-loc">Ubicación habitual</Label>
          <Select
            value={defaultLocationId}
            onValueChange={(v) => setDefaultLocationId(v ?? EMPTY_VALUE_SENTINEL)}
          >
            <SelectTrigger id="ap-default-loc" className="w-full">
              <SelectValue placeholder="Ubicación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE_SENTINEL}>Sin asignar</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      {/* Primer lote */}
      <fieldset className="space-y-3 pt-3 border-t border-border">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Primer lote
        </legend>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-qty">Cantidad</Label>
            <Input
              id="ap-qty"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-expires">Vence</Label>
            <Input
              id="ap-expires"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ap-brand">Marca</Label>
            <Input
              id="ap-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="La Serenísima"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-barcode">Código de barras</Label>
            <Input
              id="ap-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              inputMode="numeric"
              placeholder="779..."
              autoComplete="off"
            />
          </div>
        </div>
      </fieldset>

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
        Crear producto y lote
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// AddLotToExistingForm: agregar un lote a un producto que ya existe
// ----------------------------------------------------------------------------

function AddLotToExistingForm({
  product,
  locations,
  prefill,
  onSuccess,
}: {
  product: ProductWithLocation;
  locations: Location[];
  prefill?: LotPrefill | null;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("1");
  const [expiresOn, setExpiresOn] = useState<string>(prefill?.expires_on ?? "");
  const [brand, setBrand] = useState<string>(prefill?.brand ?? "");
  const [barcode, setBarcode] = useState<string>(prefill?.barcode ?? "");
  const [locationId, setLocationId] = useState<string>(
    product.default_location_id ?? EMPTY_VALUE_SENTINEL,
  );

  function handleSubmit() {
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    const payload: LotInput = {
      product_id: product.id,
      quantity: qty,
      location_id:
        locationId === EMPTY_VALUE_SENTINEL ? null : locationId,
      expires_on: expiresOn || null,
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      image_url: prefill?.image_url ?? null,
    };

    startTransition(async () => {
      const result = await addLotAction(payload);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onSuccess();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ae-qty">Cantidad</Label>
          <Input
            id="ae-qty"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ae-expires">Vence</Label>
          <Input
            id="ae-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ae-loc">Ubicación</Label>
        <Select
          value={locationId}
          onValueChange={(v) => setLocationId(v ?? EMPTY_VALUE_SENTINEL)}
        >
          <SelectTrigger id="ae-loc" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_VALUE_SENTINEL}>Sin asignar</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ae-brand">Marca</Label>
          <Input
            id="ae-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="La Serenísima"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ae-barcode">Código de barras</Label>
          <Input
            id="ae-barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            inputMode="numeric"
            placeholder="779..."
            autoComplete="off"
          />
        </div>
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
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowRight className="size-4" />
        )}
        Agregar lote a {product.name}
      </Button>
    </div>
  );
}
