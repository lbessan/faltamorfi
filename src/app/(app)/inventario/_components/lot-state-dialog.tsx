"use client";

/**
 * Modal único que controla el "estado" de conservación de un lote:
 *
 *   - kind="frozen"  → freezer (frozen_at + frozen_max_days)
 *   - kind="opened"  → abierto en heladera (opened_at + opened_max_days)
 *
 * Sirve tanto para activar como para editar/desactivar. Al abrirse con el
 * estado vacío, dispara una sugerencia de IA (Claude Haiku) que pre-rellena
 * los días máximos. El usuario puede editar antes de guardar.
 *
 * Tiene dos modos:
 *
 *   - **Controlled lot** (`lotId` definido): aplica los cambios con
 *     `updateLotAction` directo a la DB.
 *   - **Builder** (`onChange` definido): no toca la DB, devuelve los valores
 *     al padre para que los junte al crear un lote nuevo (en el alta).
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageOpen, Snowflake, Sparkles, Trash2 } from "lucide-react";

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

import { updateLotAction } from "../actions";

export type LotStateKind = "frozen" | "opened";

export type LotStateValues = {
  date: string | null;
  maxDays: number | null;
};

type CommonProps = {
  kind: LotStateKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productCategory?: string | null;
  /** Marca del lote, si se quiere pasar a la IA para mejor sugerencia. */
  productBrand?: string | null;
  /** Estado actual del lote (si null, está desactivado). */
  current: LotStateValues;
};

type ControlledProps = CommonProps & {
  /** ID del lote a actualizar. Si está presente, escribimos en la DB. */
  lotId: string;
  onChange?: never;
};

type BuilderProps = CommonProps & {
  lotId?: never;
  /** Callback que recibe los nuevos valores. Si pasa null = desactivar. */
  onChange: (next: LotStateValues | null) => void;
};

type Props = ControlledProps | BuilderProps;

const KIND_COPY = {
  frozen: {
    title: "Marcar como freezado",
    description:
      "El lote pasa al freezer. Vamos a usar la fecha de freezado para calcular el vencimiento real.",
    dateLabel: "Freezado el",
    daysLabel: "Máx. días en freezer",
    enableCta: "Marcar freezado",
    disableCta: "Sacar del freezer",
    iconClass: "text-primary",
    endpoint: "freezer-lifetime" as const,
    icon: Snowflake,
  },
  opened: {
    title: "Marcar como abierto en heladera",
    description:
      "El envase ya está abierto. Vamos a contar los días desde que lo abriste para avisarte antes de que se pase.",
    dateLabel: "Abierto el",
    daysLabel: "Máx. días abierto",
    enableCta: "Marcar abierto",
    disableCta: "Cerrar y resetear",
    iconClass: "text-primary",
    endpoint: "opened-lifetime" as const,
    icon: PackageOpen,
  },
} as const;

type Suggestion = {
  days: number;
  reason: string;
  confidence: "low" | "medium" | "high";
};

export function LotStateDialog(props: Props) {
  const {
    kind,
    open,
    onOpenChange,
    productName,
    productCategory,
    productBrand,
    current,
  } = props;
  const copy = KIND_COPY[kind];
  const Icon = copy.icon;

  const router = useRouter();
  const [savingPending, startSaving] = useTransition();

  const [date, setDate] = useState<string>(current.date ?? todayIso());
  const [maxDays, setMaxDays] = useState<string>(
    current.maxDays != null ? String(current.maxDays) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const wasActive = current.date !== null;

  // Re-sync state cuando el dialog se vuelve a abrir o cambia el lote — derived
  // state pattern (sin refs ni useEffect) para evitar cascading renders.
  const syncKey = `${open}-${current.date ?? "none"}-${current.maxDays ?? "none"}`;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(null);
  if (open && lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey);
    setDate(current.date ?? todayIso());
    setMaxDays(current.maxDays != null ? String(current.maxDays) : "");
    setError(null);
    setSuggestion(null);
  } else if (!open && lastSyncKey !== null) {
    setLastSyncKey(null);
  }

  const fetchSuggestion = useCallback(async () => {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/${copy.endpoint}`, {
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
      const data = (await res.json()) as Suggestion;
      setSuggestion(data);
      if (data.days > 0) {
        setMaxDays(String(data.days));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos obtener la sugerencia.",
      );
    } finally {
      setSuggesting(false);
    }
  }, [copy.endpoint, productBrand, productCategory, productName]);

  // Auto-fetch al abrir si NO había estado previo (es un activate fresh).
  // Disparamos en el siguiente tick para no llamar setState en el body del
  // effect (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    if (wasActive) return;
    if (suggestion || suggesting) return;
    if (maxDays !== "") return;
    const t = setTimeout(() => {
      fetchSuggestion();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function applyValues(next: LotStateValues | null) {
    if ("onChange" in props && props.onChange) {
      props.onChange(next);
      onOpenChange(false);
      return;
    }
    if (!props.lotId) return;
    const lotId = props.lotId;
    startSaving(async () => {
      const patch =
        kind === "frozen"
          ? {
              frozen_at: next?.date
                ? new Date(`${next.date}T00:00:00`).toISOString()
                : null,
              frozen_max_days: next?.maxDays ?? null,
            }
          : {
              opened_at: next?.date
                ? new Date(`${next.date}T00:00:00`).toISOString()
                : null,
              opened_max_days: next?.maxDays ?? null,
            };
      const result = await updateLotAction(lotId, patch);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  function handleSave() {
    setError(null);
    if (!date) {
      setError("Falta la fecha.");
      return;
    }
    const days = maxDays.trim() ? Number(maxDays) : null;
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      setError("Los días máximos deben ser mayores a 0.");
      return;
    }
    applyValues({ date, maxDays: days });
  }

  function handleDisable() {
    applyValues(null);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center size-7 rounded-lg bg-primary/15 ${copy.iconClass}`}
            >
              <Icon className="size-4" />
            </span>
            {copy.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {copy.description}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="px-4 pb-6 space-y-3">
          <div className="text-xs text-muted-foreground -mt-2">
            {productName}
            {productCategory && (
              <>
                {" · "}
                <span className="text-foreground/70">{productCategory}</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lsd-date">{copy.dateLabel}</Label>
              <Input
                id="lsd-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lsd-max-days">{copy.daysLabel}</Label>
              <div className="flex gap-1">
                <Input
                  id="lsd-max-days"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder={suggesting ? "..." : "Ej. 5"}
                  value={maxDays}
                  onChange={(e) => setMaxDays(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={fetchSuggestion}
                  disabled={suggesting}
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
                : suggestion.reason}
              {suggestion.confidence === "low" && (
                <span className="text-warning-foreground/80">
                  {" "}
                  (confianza baja, verificá si dudás)
                </span>
              )}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              onClick={handleSave}
              disabled={savingPending}
              className="w-full"
            >
              {savingPending && <Loader2 className="size-4 animate-spin" />}
              {wasActive ? "Guardar cambios" : copy.enableCta}
            </Button>
            {wasActive && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDisable}
                disabled={savingPending}
                className="w-full text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {copy.disableCta}
              </Button>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ----------------------------------------------------------------------------
// LotStateControls: dos iconos clickeables (freezer + abierto) que disparan
// el modal correspondiente. Estado controlado por el padre.
// ----------------------------------------------------------------------------

type LotStateControlsProps = {
  productName: string;
  productCategory?: string | null;
  productBrand?: string | null;
  frozen: LotStateValues;
  opened: LotStateValues;
} & (
  | {
      /** Modo "edit lot": escribe a la DB directo. */
      lotId: string;
      onChange?: never;
    }
  | {
      /** Modo "builder": devuelve los nuevos valores al padre. */
      lotId?: never;
      onChange: (
        kind: LotStateKind,
        next: LotStateValues | null,
      ) => void;
    }
);

export function LotStateControls(props: LotStateControlsProps) {
  const [openKind, setOpenKind] = useState<LotStateKind | null>(null);
  const frozenActive = props.frozen.date !== null;
  const openedActive = props.opened.date !== null;

  return (
    <>
      <div className="inline-flex items-center gap-0.5">
        <LotStateIconButton
          kind="frozen"
          active={frozenActive}
          onClick={() => setOpenKind("frozen")}
        />
        <LotStateIconButton
          kind="opened"
          active={openedActive}
          onClick={() => setOpenKind("opened")}
        />
      </div>

      {openKind && (
        <LotStateDialog
          {...(props.lotId
            ? { lotId: props.lotId }
            : {
                onChange: (next) =>
                  (
                    props as Extract<LotStateControlsProps, { onChange: unknown }>
                  ).onChange(openKind, next),
              })}
          kind={openKind}
          open={openKind !== null}
          onOpenChange={(o) => !o && setOpenKind(null)}
          productName={props.productName}
          productCategory={props.productCategory ?? null}
          productBrand={props.productBrand ?? null}
          current={openKind === "frozen" ? props.frozen : props.opened}
        />
      )}
    </>
  );
}

export function LotStateIconButton({
  kind,
  active,
  onClick,
  size = "md",
}: {
  kind: LotStateKind;
  active: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const Icon = kind === "frozen" ? Snowflake : PackageOpen;
  const label = kind === "frozen" ? "Freezer" : "Abierto en heladera";
  const sizeClasses =
    size === "md" ? "size-8 [&_svg]:size-4" : "size-7 [&_svg]:size-3.5";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        active ? `${label} — activo` : `${label} — tocar para activar`
      }
      aria-pressed={active}
      title={
        active
          ? `${label}: activo (click para editar)`
          : `${label} (click para activar)`
      }
      className={`inline-flex items-center justify-center rounded-md transition-colors ${sizeClasses} ${
        active
          ? "text-primary bg-primary/15 hover:bg-primary/25"
          : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40"
      }`}
    >
      <Icon />
    </button>
  );
}
