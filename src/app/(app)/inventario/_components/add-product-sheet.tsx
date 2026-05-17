"use client";

import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Location } from "@/lib/database.types";
import { addProductAction } from "../actions";
import { ProductForm, type ProductFormDefaults } from "./product-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  /** Valores prellenados, p.ej. desde Open Food Facts tras un escaneo. */
  prefill?: ProductFormDefaults | null;
  /** Si está definido, se muestra un botón "Escanear código" arriba del form. */
  onScanClick?: () => void;
};

export function AddProductSheet({
  open,
  onOpenChange,
  locations,
  prefill,
  onScanClick,
}: Props) {
  const hasPrefillFromScan = Boolean(prefill?.barcode);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {hasPrefillFromScan ? "Producto escaneado" : "Agregar producto"}
          </SheetTitle>
          <SheetDescription>
            {hasPrefillFromScan
              ? "Cargamos lo que pudimos. Ajustá cantidad y ubicación antes de guardar."
              : "Solo el nombre es obligatorio. El resto te ayuda a buscarlo y a que las alertas funcionen."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {onScanClick && !hasPrefillFromScan && (
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

          <ProductForm
            action={addProductAction}
            locations={locations}
            initialValues={prefill ?? undefined}
            submitLabel="Agregar"
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
