"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ROLE_LABELS,
  type Household,
  type HouseholdRole,
} from "@/lib/database.types";
import { renameHouseholdAction } from "../actions";

type Props = {
  household: Household;
  role: HouseholdRole | null;
};

export function HouseholdSettings({ household, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(household.name);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await renameHouseholdAction(name);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setName(household.name);
    setEditing(false);
    setError(null);
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Configuración
      </h2>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-muted-foreground">Nombre del hogar</span>
            {role && (
              <span className="text-[10px] text-primary uppercase tracking-wider">
                Tu rol: {ROLE_LABELS[role]}
              </span>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Casa de..."
                autoFocus
                maxLength={80}
              />
              {error && (
                <p
                  role="alert"
                  className="text-xs text-destructive border border-destructive/30 rounded-md px-2 py-1"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={cancel}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={pending || !name.trim()}
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{household.name}</span>
              {role === "owner" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="h-7"
                >
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
