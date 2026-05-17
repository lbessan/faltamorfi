import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

export const metadata: Metadata = {
  title: "Lista",
};

export default function ListaPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-4">
        <ListChecks className="size-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">Lista de compras</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Próximamente: te armamos la lista automática con todo lo que tenés bajo
        umbral. Viene en la Fase 4.
      </p>
    </div>
  );
}
