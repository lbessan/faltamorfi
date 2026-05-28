"use client";

import { useState, useTransition } from "react";
import {
  Check,
  ChefHat,
  Clock,
  Loader2,
  Plus,
  Refrigerator,
  ShoppingBasket,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import { addCustomItemAction } from "@/app/(app)/compras/actions";

import type {
  RecipesResult,
  RecipeSuggestion,
} from "@/lib/ai/suggest-recipes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: RecipesResult }
  | { kind: "error"; message: string };

export function RecipeSuggestionsDialog({ open, onOpenChange }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  // Reset al cerrar — derived state pattern.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open) setState({ kind: "idle" });
    else if (open && state.kind === "idle") {
      // Disparamos el fetch al abrir.
      void fetchSuggestions();
    }
  }

  async function fetchSuggestions() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/recipes", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RecipesResult;
      setState({ kind: "ready", result: data });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "No pudimos generar sugerencias.",
      });
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="md:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-7 rounded-lg bg-primary/15 text-primary">
              <ChefHat className="size-4" />
            </span>
            ¿Qué cocino hoy?
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Sugerencias usando lo que tenés, priorizando lo que vence pronto.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="px-4 pb-6 space-y-3">
          {state.kind === "loading" && <LoadingState />}
          {state.kind === "error" && (
            <ErrorState message={state.message} onRetry={fetchSuggestions} />
          )}
          {state.kind === "ready" && (
            <ReadyState
              result={state.result}
              onRefresh={fetchSuggestions}
            />
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ----------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <Loader2 className="size-8 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">
        Revisando tu inventario y armando ideas…
      </p>
      <p className="text-xs text-muted-foreground/80">
        Puede tardar 5-10 segundos.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="font-medium">No pudimos generar sugerencias.</p>
        <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
      </div>
      <Button onClick={onRetry} variant="outline" className="w-full">
        Probá de nuevo
      </Button>
    </div>
  );
}

function ReadyState({
  result,
  onRefresh,
}: {
  result: RecipesResult;
  onRefresh: () => void;
}) {
  const { recipes, note } = result;

  return (
    <div className="space-y-3">
      {note && (
        <p className="text-xs text-muted-foreground bg-accent/40 border border-border rounded-md px-3 py-2">
          {note}
        </p>
      )}
      {recipes.length === 0 && !note && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No tenemos sugerencias por ahora.
        </p>
      )}
      <ul className="space-y-3">
        {recipes.map((r, i) => (
          <li key={i}>
            <RecipeCard recipe={r} />
          </li>
        ))}
      </ul>
      <Button
        onClick={onRefresh}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <Sparkles className="size-3.5" />
        Otras ideas
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------

function RecipeCard({ recipe }: { recipe: RecipeSuggestion }) {
  const difficultyBadge =
    recipe.difficulty === "fácil"
      ? "bg-primary/15 text-primary"
      : recipe.difficulty === "media"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-destructive/15 text-destructive";

  return (
    <article className="rounded-xl border border-border bg-card p-3 space-y-2">
      <header className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-base font-bold leading-tight">
            {recipe.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {recipe.description}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {recipe.time_minutes}min
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md uppercase tracking-wide ${difficultyBadge}`}
          >
            {recipe.difficulty}
          </span>
        </div>
      </header>

      <p className="text-xs text-primary border-l-2 border-primary/40 pl-2 italic">
        {recipe.why_now}
      </p>

      {recipe.uses_from_stock.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1 flex items-center gap-1">
            <Refrigerator className="size-3" />
            Usás de tu stock
          </p>
          <ul className="text-xs space-y-0.5">
            {recipe.uses_from_stock.map((u, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Check className="size-3 text-primary mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">{u.product_name}</span>{" "}
                  <span className="text-muted-foreground">
                    ({u.quantity_text})
                  </span>
                  {u.notes && (
                    <span className="text-muted-foreground italic">
                      {" "}
                      — {u.notes}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.missing_ingredients.length > 0 && (
        <MissingIngredientsBlock items={recipe.missing_ingredients} />
      )}
    </article>
  );
}

// ----------------------------------------------------------------------------

function MissingIngredientsBlock({
  items,
}: {
  items: RecipeSuggestion["missing_ingredients"];
}) {
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  function addOne(index: number, item: (typeof items)[number]) {
    setPendingIdx(index);
    startTransition(async () => {
      const result = await addCustomItemAction({
        name: item.name,
        quantity: 1,
        unit: "un",
        notes: `Para una receta · ${item.quantity_text}`,
      });
      if (result.status === "success") {
        setAdded((prev) => new Set(prev).add(index));
      }
      setPendingIdx(null);
    });
  }

  function addAll() {
    startTransition(async () => {
      for (let i = 0; i < items.length; i++) {
        if (added.has(i)) continue;
        await addCustomItemAction({
          name: items[i].name,
          quantity: 1,
          unit: "un",
          notes: `Para una receta · ${items[i].quantity_text}`,
        });
        setAdded((prev) => new Set(prev).add(i));
      }
    });
  }

  const allAdded = added.size === items.length;

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
          <ShoppingBasket className="size-3" />
          Faltaría comprar
        </p>
        {!allAdded && items.length > 1 && (
          <button
            type="button"
            onClick={addAll}
            disabled={pending}
            className="text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            Agregar todo a la lista
          </button>
        )}
      </div>
      <ul className="text-xs space-y-0.5">
        {items.map((m, i) => {
          const isAdded = added.has(i);
          return (
            <li key={i} className="flex items-center gap-1.5">
              {isAdded ? (
                <Check className="size-3 text-primary shrink-0" />
              ) : (
                <X
                  className={`size-3 shrink-0 ${
                    m.importance === "imprescindible"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                />
              )}
              <span className={isAdded ? "text-muted-foreground" : ""}>
                <span className={isAdded ? "" : "font-medium"}>{m.name}</span>{" "}
                <span className="text-muted-foreground">
                  ({m.quantity_text})
                </span>
                {m.importance === "opcional" && (
                  <span className="text-muted-foreground/70 italic">
                    {" "}
                    · opcional
                  </span>
                )}
              </span>
              {!isAdded && (
                <button
                  type="button"
                  onClick={() => addOne(i, m)}
                  disabled={pending}
                  className="ml-auto text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 disabled:opacity-50"
                  aria-label={`Agregar ${m.name} a la lista`}
                >
                  {pendingIdx === i ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  A lista
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
