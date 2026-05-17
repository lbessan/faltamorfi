"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/database.types";
import { createInvitationAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InviteDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [result, setResult] = useState<{
    token: string;
    code: string;
    role: "member" | "viewer";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  function reset() {
    setRole("member");
    setResult(null);
    setError(null);
    setCopied(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await createInvitationAction(role);
      if (res.status === "error") {
        setError(res.message);
        return;
      }
      if (res.status === "success" && "token" in res) {
        setResult({ token: res.token, code: res.code, role: res.role });
        router.refresh();
      }
    });
  }

  async function copy(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("No pudimos copiar. Tocá el valor para seleccionarlo.");
    }
  }

  async function share(url: string) {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Invitación a Falta Morfi",
          text: "Te invito a mi hogar en Falta Morfi:",
          url,
        });
      } catch {
        // El user canceló el share dialog del browser, no es error.
      }
    } else {
      copy(url, "link");
    }
  }

  const inviteUrl =
    result && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${result.token}`
      : "";

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Invitar a alguien
          </SheetTitle>
          <SheetDescription>
            Generá un código o link para sumar a alguien al hogar. Vencen a las
            24 hs y son de un solo uso.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {!result ? (
            <>
              <div className="space-y-2">
                <Label>Rol que va a tener</Label>
                <div className="grid grid-cols-2 gap-2">
                  <RoleOption
                    selected={role === "member"}
                    onClick={() => setRole("member")}
                    title={ROLE_LABELS.member}
                    description={ROLE_DESCRIPTIONS.member}
                  />
                  <RoleOption
                    selected={role === "viewer"}
                    onClick={() => setRole("viewer")}
                    title={ROLE_LABELS.viewer}
                    description={ROLE_DESCRIPTIONS.viewer}
                  />
                </div>
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
                onClick={generate}
                disabled={pending}
                className="w-full"
                size="lg"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Generar invitación
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-center">
                Invitación válida por 24 hs · {ROLE_LABELS[result.role]}
              </div>

              <div className="space-y-2">
                <Label>Código corto (para dictar)</Label>
                <button
                  type="button"
                  onClick={() => copy(result.code, "code")}
                  className="w-full font-mono text-3xl tracking-[0.3em] font-bold py-4 rounded-xl border border-border bg-card hover:bg-accent/40 active:scale-[0.99] transition-all"
                >
                  {result.code}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  {copied === "code"
                    ? "Copiado ✓"
                    : "Tap para copiar"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Link</Label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono truncate">
                    {inviteUrl}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copy(inviteUrl, "link")}
                    aria-label="Copiar link"
                  >
                    {copied === "link" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="default"
                onClick={() => share(inviteUrl)}
                className="w-full"
                size="lg"
              >
                <Share2 className="size-4" />
                Compartir
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => reset()}
                className="w-full"
              >
                Generar otra
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RoleOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-all active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-accent/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-sm">{title}</span>
        {selected && (
          <div className="size-4 rounded-full bg-primary flex items-center justify-center">
            <Check className="size-3 text-primary-foreground" strokeWidth={3} />
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}
