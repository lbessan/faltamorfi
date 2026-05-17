"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// La lib accede a `navigator`/`window` al cargar — la importamos en cliente.
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center aspect-square bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (barcode: string) => void;
  title?: string;
  description?: string;
};

export function BarcodeScannerSheet({
  open,
  onOpenChange,
  onDetected,
  title = "Escanear código",
  description = "Apuntá la cámara al código de barras del producto.",
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(
    (
      detected: Array<{
        rawValue: string;
        format?: string;
      }>,
    ) => {
      const first = detected[0];
      if (!first?.rawValue) return;
      onDetected(first.rawValue);
    },
    [onDetected],
  );

  const handleError = useCallback((err: unknown) => {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "No pudimos acceder a la cámara.";
    setError(message);
  }, []);

  function handleClose() {
    setError(null);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto p-0 gap-0"
      >
        <SheetHeader className="px-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <ScanLine className="size-4" />
                {title}
              </SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="px-4 pb-6">
          {error ? (
            <ScannerError message={error} onRetry={() => setError(null)} />
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-w-md mx-auto">
              {open && (
                <Scanner
                  onScan={handleScan}
                  onError={handleError}
                  formats={[...BARCODE_FORMATS]}
                  scanDelay={400}
                  paused={!open}
                  sound={false}
                  components={{
                    finder: true,
                    torch: true,
                    zoom: true,
                  }}
                  styles={{
                    container: { width: "100%", height: "100%" },
                  }}
                />
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center mt-3">
            En iOS la cámara solo arranca en HTTPS o desde localhost.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ScannerError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 max-w-md mx-auto">
      <p className="text-sm text-destructive">
        <strong>No se pudo iniciar la cámara.</strong>
      </p>
      <p className="text-xs text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Revisá los permisos del navegador (suele estar en el candado al lado de
        la URL) y volvé a intentar.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
