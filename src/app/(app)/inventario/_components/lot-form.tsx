"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Snowflake, Sparkles, X } from "lucide-react";
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
import { LOCATION_KIND_LABELS, type Location } from "@/lib/database.types";
import type { StockItemWithLocation } from "@/lib/db/stock-items";
import { addLotAction, updateLotAction, type LotInput } from "../actions";
import { EMPTY_VALUE_SENTINEL } from "../constants";

type Props = {
  productId: string;
  productName: string;
  productBrand?: string | null;
  productCategory?: string | null;
  locations: Location[];
  lot?: StockItemWithLocation;
  /** Default location id sugerido para nuevos lotes. */
  defaultLocationId?: string | null;
  onClose: () => void;
};

type FreezerSuggestion = {
  days: number;
  reason: string;
  confidence: "low" | "medium" | "high";
};

export function LotForm({
  productId,
  productName,
  productBrand,
  productCategory,
  locations,
  lot,
  defaultLocationId,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<FreezerSuggestion | null>(null);

  const [quantity, setQuantity] = useState<string>(
    lot ? String(lot.quantity) : "1",
  );
  const [locationId, setLocationId] = useState<string>(
    lot?.location_id ?? defaultLocationId ?? EMPTY_VALUE_SENTINEL,
  );
  const [expiresOn, setExpiresOn] = useState<string>(lot?.expires_on ?? "");
  const [isFrozen, setIsFrozen] = useState<boolean>(Boolean(lot?.frozen_at));
  const [frozenAt, setFrozenAt] = useState<string>(
    lot?.frozen_at ? lot.frozen_at.slice(0, 10) : todayIso(),
  );
  const [frozenMaxDays, setFrozenMaxDays] = useState<string>(
    lot?.frozen_max_days != null ? String(lot.frozen_max_days) : "",
  );

  const selectedLocation = locations.find((l) => l.id === locationId) ?? null;
  const showFreezerFields =
    isFrozen || selectedLocation?.kind === "freezer";

  async function fetchSuggestion() {
    setError(null);
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/freezer-lifetime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName,
          brand: productBrand ?? null,
          category: productCategory ?? null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as FreezerSuggestion;
      setSuggestion(data);
      if (data.days > 0) {
        setFrozenMaxDays(String(data.days));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos obtener la sugerencia.",
      );
    } finally {
      setSuggesting(false);
    }
  }

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
      location_id:
        locationId === EMPTY_VALUE_SENTINEL ? null : locationId,
      expires_on: expiresOn || null,
      frozen_at: showFreezerFields && frozenAt
        ? new Date(`${frozenAt}T00:00:00`).toISOString()
        : null,
      frozen_max_days:
        showFreezerFields && frozenMaxDays
          ? Number(frozenMaxDays)
          : null,
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
        <h3 className="text-sm font-medium">
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
        <Label htmlFor="lot-location">Ubicación</Label>
        <Select
          value={locationId}
          onValueChange={(v) => setLocationId(v ?? EMPTY_VALUE_SENTINEL)}
        >
          <SelectTrigger id="lot-location" className="w-full">
            <SelectValue placeholder="Ubicación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_VALUE_SENTINEL}>Sin asignar</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
                <span className="text-muted-foreground ml-1 text-xs">
                  · {LOCATION_KIND_LABELS[loc.kind] ?? "General"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        onClick={() => setIsFrozen((v) => !v)}
        className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
          isFrozen
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent/40"
        }`}
        aria-pressed={isFrozen}
      >
        <span className="inline-flex items-center gap-2">
          <Snowflake className="size-4" />
          Está freezado
        </span>
        <span className="text-xs">{isFrozen ? "Sí" : "No"}</span>
      </button>

      {showFreezerFields && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lot-frozen-at">Freezado el</Label>
              <Input
                id="lot-frozen-at"
                type="date"
                value={frozenAt}
                onChange={(e) => setFrozenAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-frozen-max">Máx. días freezer</Label>
              <div className="flex gap-1">
                <Input
                  id="lot-frozen-max"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder="Ej. 90"
                  value={frozenMaxDays}
                  onChange={(e) => setFrozenMaxDays(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={fetchSuggestion}
                  disabled={suggesting || !productName}
                  aria-label="Sugerir con IA"
                  title="Sugerir con IA"
                >
                  {suggesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {suggestion && (
            <p className="text-xs text-muted-foreground bg-accent/40 border border-border rounded-md px-2 py-1.5">
              <Sparkles className="size-3 inline mr-1 text-primary" />
              {suggestion.days > 0
                ? `${suggestion.days} días — ${suggestion.reason}`
                : `No se recomienda freezar. ${suggestion.reason}`}
              {suggestion.confidence === "low" && (
                <span className="text-warning-foreground/80">
                  {" "}
                  (confianza baja, verificá si dudás)
                </span>
              )}
            </p>
          )}
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

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
