import type { Metadata } from "next";
import { ListChecks, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Lista",
};

export default function ListaPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="relative">
        <div className="size-20 rounded-full bg-warning/20 flex items-center justify-center">
          <ListChecks className="size-10 text-warning-foreground" strokeWidth={1.5} />
        </div>
        <Sparkles className="absolute -top-1 -right-1 size-5 text-warning" />
      </div>
      <div className="space-y-1 max-w-xs">
        <h1 className="font-heading text-2xl font-bold">Lista de compras</h1>
        <p className="text-sm text-muted-foreground">
          Te vamos a armar la lista automáticamente con todo lo que está bajo
          umbral. Pronto.
        </p>
        <p className="text-xs text-muted-foreground/80 pt-2">
          Viene en la Fase 4.
        </p>
      </div>
    </div>
  );
}
