"use client";

/**
 * Modal para registrar consumo de un lote cuando la unidad es continua
 * (kg, g, l, ml). En estos casos, restar de a un step chico (0.1) no tiene
 * sentido — nadie mide el aceite que usa al ml. En su lugar damos dos
 * opciones rápidas: vaciar todo el lote, o ingresar una cantidad parcial.
 *
 * Para unidades discretas (un, paq), el botón "-" sigue restando 1 directo
 * sin pasar por este modal.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import { consumeLotAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lotId: string;
  productName: string;
  /** Cantidad actual del lote. */
  currentQuantity: number;
  /** Label de unidad para mostrar (ej. "litros"). */
  unitLabel: string;
};

export function ConsumeLotDialog({
  open,
  onOpenChange,
  lotId,
  productName,
  currentQuantity,
  unitLabel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset al cerrar / cambiar de lote — derived state pattern.
  const syncKey = `${open}-${lotId}`;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(null);
  if (open && lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    setPartial("");
    setError(null);
  } else if (!open && lastSyncKey !== null) {
    setLastSyncKey(null);
  }

  function handleConsumeAll() {
    setError(null);
    startTransition(async () => {
      const result = await consumeLotAction(lotId, currentQuantity);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  function handleConsumePartial() {
    setError(null);
    const n = Number(partial.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Ingresá una cantidad mayor a 0.");
      return;
    }
    if (n > currentQuantity) {
      setError(
        `No podés consumir más de lo que hay en el lote (${formatQty(currentQuantity)} ${unitLabel}).`,
      );
      return;
    }
    startTransition(async () => {
      const result = await consumeLotAction(lotId, n);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Consumir lote</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {productName} · {formatQty(currentQuantity)} {unitLabel} disponibles
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Acción principal: vaciar todo */}
          <div className="space-y-2">
            <Button
              type="button"
              onClick={handleConsumeAll}
              disabled={pending}
              className="w-full"
              size="lg"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Vaciar lote ({formatQty(currentQuantity)} {unitLabel})
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Si terminaste el aceite, el paquete, la botella, etc.
            </p>
          </div>

          {/* Divider con label */}
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-border" />
            <span className="px-2 text-[11px] text-muted-foreground uppercase tracking-wider">
              o
            </span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Consumo parcial */}
          <div className="space-y-2">
            <Label htmlFor="cld-partial" className="text-sm">
              Consumir una cantidad puntual
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="cld-partial"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  placeholder={`Ej. ${unitLabel === "litros" ? "0.5" : "200"}`}
                  value={partial}
                  onChange={(e) => setPartial(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {unitLabel}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleConsumePartial}
                disabled={pending || !partial.trim()}
              >
                <Minus className="size-4" />
                Restar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Útil si solo usaste una parte y querés que siga apareciendo el
              lote.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
