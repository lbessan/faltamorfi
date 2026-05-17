"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { joinByCodeOrTokenAction } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JoinByCodeDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setLookup("");
    setError(null);
    setSuccess(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function submit() {
    setError(null);
    setSuccess(null);
    if (!lookup.trim()) {
      setError("Pegá el código o el link.");
      return;
    }
    startTransition(async () => {
      const result = await joinByCodeOrTokenAction(lookup);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.status === "success") {
        setSuccess(result.message ?? "Te sumaste al hogar.");
        router.refresh();
        // Cerrar después de un segundo
        setTimeout(() => handleClose(false), 1200);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LogIn className="size-4" />
            Unirme con código
          </SheetTitle>
          <SheetDescription>
            Pegá el código o el link de invitación que te compartieron.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="join-lookup">Código o link</Label>
            <Input
              id="join-lookup"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="K7M3PQXY o https://..."
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="text-sm text-foreground border border-primary/30 rounded-md px-3 py-2 bg-primary/5"
            >
              {success}
            </p>
          )}

          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            className="w-full"
            size="lg"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Unirme
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
