"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Lot } from "@/lib/db/stock-items";
import { addLotAction, updateLotAction, type LotInput } from "../actions";
import {
  LotStateControls,
  type LotStateValues,
} from "./lot-state-dialog";

export type LotPrefill = {
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  expires_on?: string | null;
  notes?: string | null;
};

type Props = {
  productId: string;
  productName: string;
  productCategory?: string | null;
  lot?: Lot;
  /** Datos prellenados (típicamente desde Open Food Facts via escaneo). */
  prefill?: LotPrefill;
  /** Si está definido, se muestra botón "Escanear código" que invoca al padre. */
  onScanClick?: () => void;
  onClose: () => void;
};

export function LotForm({
  productId,
  productName,
  productCategory,
  lot,
  prefill,
  onScanClick,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Estado del form
  const [quantity, setQuantity] = useState<string>(
    lot ? String(lot.quantity) : "1",
  );
  const [expiresOn, setExpiresOn] = useState<string>(
    lot?.expires_on ?? prefill?.expires_on ?? "",
  );
  const [brand, setBrand] = useState<string>(
    lot?.brand ?? prefill?.brand ?? "",
  );
  const [variant, setVariant] = useState<string>(lot?.variant ?? "");
  const [barcode, setBarcode] = useState<string>(
    lot?.barcode ?? prefill?.barcode ?? "",
  );
  const [imageUrl] = useState<string>(
    lot?.image_url ?? prefill?.image_url ?? "",
  );
  const [notes, setNotes] = useState<string>(
    lot?.notes ?? prefill?.notes ?? "",
  );

  const [frozenState, setFrozenState] = useState<LotStateValues>({
    date: lot?.frozen_at ? lot.frozen_at.slice(0, 10) : null,
    maxDays: lot?.frozen_max_days ?? null,
  });
  const [openedState, setOpenedState] = useState<LotStateValues>({
    date: lot?.opened_at ? lot.opened_at.slice(0, 10) : null,
    maxDays: lot?.opened_max_days ?? null,
  });

  function handleSubmit() {
    setError(null);
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    const payload: LotInput = {
      product_id: productId,
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
      image_url: imageUrl || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = lot
        ? await updateLotAction(lot.id, payload)
        : await addLotAction(payload);

      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium truncate">
          {lot ? "Editar lote" : "Nuevo lote"}
          <span className="text-muted-foreground"> · {productName}</span>
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Cerrar"
          className="size-7"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Imagen del producto si hay */}
      {imageUrl && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
          <div className="relative size-12 rounded-md overflow-hidden bg-background shrink-0">
            <Image
              src={imageUrl}
              alt={brand || productName}
              fill
              sizes="48px"
              className="object-contain"
            />
          </div>
          <div className="text-xs text-muted-foreground min-w-0">
            <div className="truncate">{brand || "Sin marca"}</div>
            {barcode && <div className="font-mono truncate">{barcode}</div>}
          </div>
        </div>
      )}

      {onScanClick && !lot && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onScanClick}
        >
          <ScanLine className="size-4" />
          Escanear código de barras
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="lot-quantity">Cantidad</Label>
          <Input
            id="lot-quantity"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lot-expires">Vence</Label>
          <Input
            id="lot-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lot-variant">Variante (opcional)</Label>
        <Input
          id="lot-variant"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          placeholder={variantPlaceholder(productName)}
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground/80">
          Subtipo dentro del producto. Ej.: chips de chocolate, tallarines,
          descremada.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="lot-brand">Marca</Label>
          <Input
            id="lot-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="La Serenísima"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lot-barcode">Código de barras</Label>
          <Input
            id="lot-barcode"
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
          productName={productName}
          productCategory={productCategory ?? null}
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

      <div className="space-y-1.5">
        <Label htmlFor="lot-notes">Notas del lote (opcional)</Label>
        <Input
          id="lot-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Compré en oferta, primera vez esta marca, etc."
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
        {lot ? "Guardar cambios" : "Agregar lote"}
      </Button>
    </div>
  );
}

/**
 * Sugerencia de variante según el tipo de producto. Pista visual para el
 * usuario, no impone nada (el campo es texto libre).
 */
function variantPlaceholder(productName: string): string {
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
