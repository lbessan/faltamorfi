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
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  LotStateControls,
  type LotStateValues,
} from "./lot-state-dialog";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { UNITS, UNIT_LABELS, type Unit } from "@/lib/database.types";
import type { ProductWithLots } from "@/lib/db/products";
import {
  addLotAction,
  createProductWithLotAction,
  type LotInput,
} from "../actions";
import type { LotPrefill } from "./lot-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catálogo completo de productos del hogar (para sugerir y evitar duplicados). */
  catalog: ProductWithLots[];
  /** Datos prellenados (típicamente desde Open Food Facts via escaneo). */
  prefill?: LotPrefill | null;
  /** Si hay un producto existente que matchea por nombre/categoría, lo sugerimos. */
  suggestedMatch?: ProductWithLots | null;
  /** Si está definido, mostramos botón "Escanear código de barras". */
  onScanClick?: () => void;
  /**
   * Counter incremental que cambia cada vez que el padre abre el sheet. Lo
   * usamos para resetear el modo interno (create/addToExisting) y no quedar
   * "pegado" en el último producto que el usuario eligió desde el combobox.
   */
  openKey?: number;
};

type Mode =
  | { kind: "create" } // crear tipo nuevo + primer lote
  | { kind: "addToExisting"; product: ProductWithLots }; // sumar lote a un tipo existente

export function AddProductSheet({
  open,
  onOpenChange,
  catalog,
  prefill,
  suggestedMatch,
  onScanClick,
  openKey = 0,
}: Props) {
  // Si hay un suggested match, arrancamos en modo "agregar a existente".
  const initialMode: Mode = suggestedMatch
    ? { kind: "addToExisting", product: suggestedMatch }
    : { kind: "create" };

  const [mode, setMode] = useState<Mode>(initialMode);

  // Reset cuando cambia el suggested match, el prefill o el openKey
  // (incremental, se actualiza cuando el padre reabre el sheet a mano).
  const resetKey = `${openKey}-${suggestedMatch?.id ?? "none"}-${prefill?.barcode ?? "none"}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setMode(initialMode);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode.kind === "addToExisting"
              ? `Sumar lote a ${mode.product.name}`
              : prefill?.barcode
                ? "Producto escaneado"
                : "Cargar producto"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {mode.kind === "addToExisting"
              ? "Estás agregando otro lote del mismo tipo."
              : "Definí el tipo y cargá el primer lote en una sola pantalla."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

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
              catalog={catalog}
              prefill={prefill}
              onPickExisting={(product) =>
                setMode({ kind: "addToExisting", product })
              }
              onSuccess={() => onOpenChange(false)}
            />
          ) : (
            <AddLotToExistingForm
              product={mode.product}
              prefill={prefill}
              onSuccess={() => onOpenChange(false)}
            />
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ----------------------------------------------------------------------------

function MatchSwitcher({
  match,
  mode,
  onChoose,
}: {
  match: ProductWithLots;
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
  catalog,
  prefill,
  onPickExisting,
  onSuccess,
}: {
  catalog: ProductWithLots[];
  prefill?: LotPrefill | null;
  onPickExisting: (product: ProductWithLots) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Tipo
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  /** El usuario nunca tocó manualmente categoría → podemos auto-rellenarla. */
  const [categoryAutoFilled, setCategoryAutoFilled] = useState(true);
  const [unit, setUnit] = useState<Unit>("un");
  const [threshold, setThreshold] = useState("1");

  // Primer lote
  const [quantity, setQuantity] = useState("1");
  const [expiresOn, setExpiresOn] = useState<string>(
    prefill?.expires_on ?? "",
  );
  const [brand, setBrand] = useState<string>(prefill?.brand ?? "");
  const [variant, setVariant] = useState<string>("");
  const [barcode, setBarcode] = useState<string>(prefill?.barcode ?? "");
  const [frozenState, setFrozenState] = useState<LotStateValues>({
    date: null,
    maxDays: null,
  });
  const [openedState, setOpenedState] = useState<LotStateValues>({
    date: null,
    maxDays: null,
  });

  // Opciones para el combobox = catálogo del hogar (productos activos).
  const options: ComboboxOption<ProductWithLots>[] = catalog
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.category ?? undefined,
      data: p,
    }));

  function handlePickFromCatalog(opt: ComboboxOption<ProductWithLots>) {
    // Si ya existe en el catálogo, mejor sumar al existente para no duplicar.
    if (opt.data) {
      onPickExisting(opt.data);
    }
  }

  function handleNameChange(v: string) {
    setName(v);
    // Si la categoría está libre (no la editó el usuario), sugerimos una
    // del catálogo según palabras en común con el nombre tipeado.
    if (categoryAutoFilled) {
      const suggestion = suggestCategoryFromCatalog(v, catalog);
      setCategory(suggestion ?? "");
    }
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Ponele un nombre al tipo (ej. 'Leche').");
      return;
    }
    // Defensa adicional: si el nombre coincide (case/acentos) con uno existente,
    // forzamos el switch para no permitir duplicados.
    const dup = catalog.find((p) => normalizeName(p.name) === normalizeName(name));
    if (dup) {
      onPickExisting(dup);
      return;
    }
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    startTransition(async () => {
      const result = await createProductWithLotAction({
        product: {
          name: name.trim(),
          category: category.trim() || null,
          unit,
          low_stock_threshold: Number(threshold.replace(",", ".")) || 1,
          notes: null,
        },
        lot: {
          quantity: qty,
          expires_on: expiresOn || null,
          frozen_at: frozenState.date
            ? new Date(`${frozenState.date}T00:00:00`).toISOString()
            : null,
          frozen_max_days: frozenState.maxDays,
          opened_at: openedState.date
            ? new Date(`${openedState.date}T00:00:00`).toISOString()
            : null,
          opened_max_days: openedState.maxDays,
          brand: brand.trim() || null,
          variant: variant.trim() || null,
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
          <Combobox<ProductWithLots>
            id="ap-name"
            value={name}
            onValueChange={handleNameChange}
            options={options}
            onSelect={handlePickFromCatalog}
            placeholder="Leche"
            emptyHint="No está en tu catálogo — se va a crear como nuevo."
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
            onChange={(e) => {
              setCategory(e.target.value);
              setCategoryAutoFilled(false);
            }}
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

        <div className="space-y-1.5">
          <Label htmlFor="ap-variant">Variante (opcional)</Label>
          <Input
            id="ap-variant"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder={variantPlaceholderForName(name)}
            autoComplete="off"
          />
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

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">Estado:</span>
          <LotStateControls
            productName={name.trim() || "este lote"}
            productCategory={category.trim() || null}
            productBrand={brand.trim() || null}
            frozen={frozenState}
            opened={openedState}
            onChange={(kind, next) => {
              const empty = { date: null, maxDays: null };
              if (kind === "frozen") setFrozenState(next ?? empty);
              else setOpenedState(next ?? empty);
            }}
          />
          <span className="text-[11px] text-muted-foreground/80">
            si está freezado o abierto
          </span>
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
  prefill,
  onSuccess,
}: {
  product: ProductWithLots;
  prefill?: LotPrefill | null;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("1");
  const [expiresOn, setExpiresOn] = useState<string>(prefill?.expires_on ?? "");
  const [brand, setBrand] = useState<string>(prefill?.brand ?? "");
  const [variant, setVariant] = useState<string>("");
  const [barcode, setBarcode] = useState<string>(prefill?.barcode ?? "");
  const [frozenState, setFrozenState] = useState<LotStateValues>({
    date: null,
    maxDays: null,
  });
  const [openedState, setOpenedState] = useState<LotStateValues>({
    date: null,
    maxDays: null,
  });

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
      expires_on: expiresOn || null,
      frozen_at: frozenState.date
        ? new Date(`${frozenState.date}T00:00:00`).toISOString()
        : null,
      frozen_max_days: frozenState.maxDays,
      opened_at: openedState.date
        ? new Date(`${openedState.date}T00:00:00`).toISOString()
        : null,
      opened_max_days: openedState.maxDays,
      brand: brand.trim() || null,
      variant: variant.trim() || null,
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
        <Label htmlFor="ae-variant">Variante (opcional)</Label>
        <Input
          id="ae-variant"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          placeholder={variantPlaceholderForName(product.name)}
          autoComplete="off"
        />
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

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">Estado:</span>
        <LotStateControls
          productName={product.name}
          productCategory={product.category}
          productBrand={brand.trim() || null}
          frozen={frozenState}
          opened={openedState}
          onChange={(kind, next) => {
            const empty = { date: null, maxDays: null };
            if (kind === "frozen") setFrozenState(next ?? empty);
            else setOpenedState(next ?? empty);
          }}
        />
        <span className="text-[10px] text-muted-foreground/80">
          tocá ❄ o 🚪 si aplica
        </span>
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

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Heurística rápida para auto-rellenar la categoría: busca productos del
 * catálogo del hogar con palabras en común con el nombre tipeado y devuelve
 * la categoría más frecuente entre los matches. Si nada coincide, null.
 */
function suggestCategoryFromCatalog(
  name: string,
  catalog: ProductWithLots[],
): string | null {
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;

  // Cuenta votos por category entre productos que comparten al menos un token.
  const votes = new Map<string, number>();
  for (const p of catalog) {
    if (!p.category) continue;
    const pTokens = tokenize(p.name);
    const shared = pTokens.filter((t) => tokens.includes(t)).length;
    if (shared === 0) continue;
    votes.set(p.category, (votes.get(p.category) ?? 0) + shared);
  }

  let best: { category: string; score: number } | null = null;
  for (const [cat, score] of votes) {
    if (!best || score > best.score) best = { category: cat, score };
  }
  return best ? best.category : null;
}

function tokenize(s: string): string[] {
  return normalizeName(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Placeholder sugerido para el campo "variante" según el tipo de producto.
 * Solo es una pista visual; el campo acepta texto libre.
 */
function variantPlaceholderForName(productName: string): string {
  const n = productName.trim().toLowerCase();
  if (n.includes("galletit")) return "chips de chocolate, manteca, oreo...";
  if (n.includes("fideos")) return "tallarines, mostachoes, moñitos...";
  if (n.includes("pasta")) return "ravioles, ñoquis, capeletini...";
  if (n.includes("leche")) return "entera, descremada, sin lactosa...";
  if (n.includes("yogur")) return "firme, bebible, griego...";
  if (n.includes("queso")) return "cremoso, semiduro, rallado...";
  if (n.includes("té")) return "negro, verde, manzanilla...";
  if (n.includes("café")) return "molido, instantáneo, en grano...";
  if (n.includes("yerba")) return "con palo, sin palo, saborizada...";
  if (n.includes("arroz")) return "blanco, integral, parboiled...";
  if (n.includes("harina")) return "000, 0000, integral...";
  if (n.includes("aceite")) return "girasol, oliva, maíz...";
  if (n.includes("vinagre")) return "alcohol, manzana, balsámico...";
  if (n.includes("vino")) return "tinto, blanco, rosado...";
  if (n.includes("cerveza")) return "rubia, negra, IPA...";
  if (n.includes("pan")) return "lactal, francés, hamburguesa...";
  if (n.includes("gaseosa")) return "coca-cola, sprite, fanta...";
  if (n.includes("jamón")) return "cocido, crudo, natural...";
  return "ej. variante o subtipo";
}
