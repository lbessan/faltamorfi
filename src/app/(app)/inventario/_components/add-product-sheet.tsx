"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Location } from "@/lib/database.types";
import { addProductAction } from "../actions";
import { ProductForm } from "./product-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
};

export function AddProductSheet({ open, onOpenChange, locations }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agregar producto</SheetTitle>
          <SheetDescription>
            Solo el nombre es obligatorio. El resto te ayuda a buscarlo y a que
            las alertas funcionen.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <ProductForm
            action={addProductAction}
            locations={locations}
            submitLabel="Agregar"
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
