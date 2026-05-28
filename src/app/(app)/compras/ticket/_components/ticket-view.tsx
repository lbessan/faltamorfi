"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNIT_LABELS, type Unit } from "@/lib/database.types";
import {
  confirmReceiptAction,
  type ReceiptItemInput,
} from "../../actions";
import type { ParsedReceipt, ReceiptItem } from "@/lib/ai/parse-receipt";

type CatalogEntry = {
  id: string;
  name: string;
  department: string | null;
  icon: string | null;
  unit: string;
};

type Props = {
  catalog: CatalogEntry[];
};

/**
 * Acumulador del review entre fotos. Cada foto suma sus items a `rows` y
 * registra su preview + parsed (para mostrar store/total agregados).
 */
type ReviewState = {
  previewUrls: string[];
  parsed: ParsedReceipt[];
  rows: ReviewRow[];
};

type Mode =
  | { kind: "pick" }
  | { kind: "analyzing"; previewUrl: string; existingReview: ReviewState | null }
  | { kind: "review"; review: ReviewState }
  | { kind: "error"; previewUrl: string | null; message: string; existingReview: ReviewState | null };

type ReviewRow = {
  /** Identificador local de la fila (no es id de DB). */
  key: string;
  /** Item raw del ticket. */
  source: ReceiptItem;
  /** Mostrar en el listado / cargar al inventario. */
  include: boolean;
  /** Tipo elegido — del catálogo (productId) o nuevo (productId=null). */
  productId: string | null;
  /** Texto del input "tipo". Si matchea, productId tiene el id; si no, queda null y se crea como nuevo. */
  typeText: string;
  /** Subtipo del producto (texto libre, editable). */
  variantText: string;
  /** Cantidad editable. */
  quantity: number;
  /** Unidad. */
  unit: Unit;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export function TicketView({ catalog }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "pick" });
  const [confirming, startConfirm] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Map name → CatalogEntry para matching rápido (case-insensitive).
  const catalogByLowerName = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(c.name.toLowerCase(), c);
    return m;
  }, [catalog]);

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    setConfirmError(null);

    // Si ya hay un review en curso, lo mantenemos para no perder lo cargado.
    const existingReview =
      mode.kind === "review"
        ? mode.review
        : mode.kind === "error"
          ? mode.existingReview
          : null;

    try {
      const { base64, mediaType, previewUrl } = await prepareImage(file);
      setMode({ kind: "analyzing", previewUrl, existingReview });

      const res = await fetch("/api/ai/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as ParsedReceipt;

      const newRows = buildRows(parsed.items, catalogByLowerName);

      // Acumulamos sobre el review existente (o arrancamos uno nuevo).
      const review: ReviewState = existingReview
        ? {
            previewUrls: [...existingReview.previewUrls, previewUrl],
            parsed: [...existingReview.parsed, parsed],
            rows: [...existingReview.rows, ...newRows],
          }
        : {
            previewUrls: [previewUrl],
            parsed: [parsed],
            rows: newRows,
          };

      setMode({ kind: "review", review });
    } catch (err) {
      setMode({
        kind: "error",
        previewUrl: null,
        message:
          err instanceof Error
            ? err.message
            : "No pudimos procesar la imagen.",
        existingReview,
      });
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    if (mode.kind !== "review") return;
    setMode({
      kind: "review",
      review: {
        ...mode.review,
        rows: mode.review.rows.map((r) =>
          r.key === key ? { ...r, ...patch } : r,
        ),
      },
    });
  }

  function setTypeText(key: string, text: string) {
    if (mode.kind !== "review") return;
    const matched = catalogByLowerName.get(text.trim().toLowerCase());
    updateRow(key, {
      typeText: text,
      productId: matched?.id ?? null,
    });
  }

  function addBlank() {
    if (mode.kind !== "review") return;
    setMode({
      kind: "review",
      review: {
        ...mode.review,
        rows: [
          ...mode.review.rows,
          {
            key: `new-${Date.now()}`,
            source: {
              raw_name: "",
              quantity: 1,
              unit: "un",
              price: null,
              brand: null,
              suggested_type: null,
              variant: null,
            },
            include: true,
            productId: null,
            typeText: "",
            variantText: "",
            quantity: 1,
            unit: "un",
          },
        ],
      },
    });
  }

  function handleConfirm() {
    if (mode.kind !== "review") return;
    setConfirmError(null);

    const inputs: ReceiptItemInput[] = mode.review.rows
      .filter((r) => r.include && r.typeText.trim().length > 0)
      .map((r) => ({
        product_id: r.productId,
        new_type_name: r.productId ? null : r.typeText.trim(),
        raw_name: r.source.raw_name,
        quantity: r.quantity,
        unit: r.unit,
        brand: r.source.brand,
        variant: r.variantText.trim() || null,
      }));

    if (inputs.length === 0) {
      setConfirmError(
        "Marcá al menos un item con un tipo válido para cargarlo.",
      );
      return;
    }

    startConfirm(async () => {
      const result = await confirmReceiptAction(inputs);
      if (result.status === "error") {
        setConfirmError(result.message);
        return;
      }
      router.push("/inventario");
    });
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href="/compras"
            aria-label="Volver"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg font-bold leading-tight flex items-center gap-2">
              <ReceiptText className="size-5" />
              Cargar desde ticket
            </h1>
            <p className="text-xs text-muted-foreground">
              Foto del ticket → carga al inventario.
            </p>
          </div>
        </div>
      </header>

      {/* Datalist global con todos los tipos del catálogo para autocomplete */}
      <datalist id="catalog-types">
        {catalog.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          // Reset para poder cargar el mismo file dos veces (raro pero posible).
          e.target.value = "";
        }}
      />

      <div className="flex-1 px-4 py-4 space-y-4 pb-32">
        {mode.kind === "pick" && <PickState onPick={openPicker} />}

        {mode.kind === "analyzing" && (
          <AnalyzingState
            previewUrl={mode.previewUrl}
            existingReview={mode.existingReview}
          />
        )}

        {mode.kind === "error" && (
          <ErrorState
            message={mode.message}
            onRetry={openPicker}
            previewUrl={mode.previewUrl}
            existingReview={mode.existingReview}
          />
        )}

        {mode.kind === "review" && (
          <ReviewState
            review={mode.review}
            confirming={confirming}
            confirmError={confirmError}
            onUpdate={updateRow}
            onSetTypeText={setTypeText}
            onAddBlank={addBlank}
            onAddPhoto={openPicker}
          />
        )}
      </div>

      {mode.kind === "review" && (
        <div className="fixed bottom-16 inset-x-0 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t border-border z-10 md:bottom-0">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Link
              href="/compras"
              aria-disabled={confirming}
              className={buttonVariants({ variant: "outline", size: "lg" }) + " flex-1"}
            >
              Cancelar
            </Link>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Cargar{" "}
              {mode.review.rows.filter(
                (r) => r.include && r.typeText.trim().length > 0,
              ).length}{" "}
              al inventario
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function PickState({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center">
        <ReceiptText className="size-10 text-primary" strokeWidth={1.5} />
      </div>
      <div className="space-y-1 max-w-sm">
        <h2 className="font-heading text-lg font-semibold">
          Sacale foto al ticket
        </h2>
        <p className="text-sm text-muted-foreground">
          La IA lee cada producto, sugiere a qué tipo pertenece y los carga
          como lotes en tu inventario.
        </p>
        <p className="text-xs text-muted-foreground/80 pt-1">
          Si el ticket es muy largo, podés sumar varias fotos en la misma
          sesión — los items se acumulan y los cargás todos juntos al final.
        </p>
      </div>
      <Button onClick={onPick} size="lg">
        <Camera className="size-4" />
        Tomar foto
      </Button>
      <Button onClick={onPick} size="sm" variant="ghost">
        <Upload className="size-3.5" />
        Elegir de la galería
      </Button>
    </div>
  );
}

function AnalyzingState({
  previewUrl,
  existingReview,
}: {
  previewUrl: string;
  existingReview: ReviewState | null;
}) {
  const photoNumber = (existingReview?.previewUrls.length ?? 0) + 1;
  return (
    <div className="space-y-3">
      {existingReview && existingReview.rows.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          Mantenemos {existingReview.rows.length} item
          {existingReview.rows.length === 1 ? "" : "s"} de la
          {existingReview.previewUrls.length > 1 ? "s fotos previas" : " foto previa"}
          . La nueva se va a sumar.
        </div>
      )}
      <PreviewImage src={previewUrl} />
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Analizando foto {photoNumber}…
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Esto puede tardar 5-15 segundos según el tamaño del ticket.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  previewUrl,
  existingReview,
  onRetry,
}: {
  message: string;
  previewUrl: string | null;
  existingReview: ReviewState | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      {previewUrl && <PreviewImage src={previewUrl} />}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm flex items-start gap-2">
        <TriangleAlert className="size-4 text-destructive mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">No pudimos procesar el ticket.</p>
          <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
          {existingReview && existingReview.rows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Lo cargado de las fotos anteriores ({existingReview.rows.length}{" "}
              items) sigue ahí.
            </p>
          )}
        </div>
      </div>
      <Button onClick={onRetry} variant="outline" className="w-full">
        <Camera className="size-4" />
        Probá de nuevo
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Review
// ----------------------------------------------------------------------------

function ReviewState({
  review,
  confirming,
  confirmError,
  onUpdate,
  onSetTypeText,
  onAddBlank,
  onAddPhoto,
}: {
  review: ReviewState;
  confirming: boolean;
  confirmError: string | null;
  onUpdate: (key: string, patch: Partial<ReviewRow>) => void;
  onSetTypeText: (key: string, text: string) => void;
  onAddBlank: () => void;
  onAddPhoto: () => void;
}) {
  const { previewUrls, parsed, rows } = review;
  const photoCount = previewUrls.length;

  const matchedCount = rows.filter(
    (r) => r.include && r.productId !== null,
  ).length;
  const newCount = rows.filter(
    (r) => r.include && r.productId === null && r.typeText.trim().length > 0,
  ).length;
  const unmatchedCount = rows.filter(
    (r) => r.include && r.typeText.trim().length === 0,
  ).length;

  // Resumen agregado: stores únicos, totales sumados.
  const stores = Array.from(new Set(parsed.map((p) => p.store).filter(Boolean)));
  const totalSum = parsed.reduce(
    (acc, p) => (p.total !== null ? acc + p.total : acc),
    0,
  );
  const hasErrorHints = parsed.some((p) => p.error_hint);

  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-border bg-card overflow-hidden">
        <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-accent/40">
          {photoCount === 1
            ? stores[0]
              ? `Ticket de ${stores[0]}`
              : "Foto del ticket"
            : `${photoCount} fotos del ticket`}
          {totalSum > 0 && ` · total $${formatPrice(totalSum)}`}
          {` · ${rows.length} items detectados`}
        </summary>
        <div className="border-t border-border p-2 grid grid-cols-2 gap-2">
          {previewUrls.map((url, i) => (
            <PreviewImage key={i} src={url} />
          ))}
        </div>
      </details>

      {hasErrorHints && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
          <TriangleAlert className="size-4 text-warning-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            {parsed
              .filter((p) => p.error_hint)
              .map((p, i) => (
                <p key={i}>· {p.error_hint}</p>
              ))}
          </div>
        </div>
      )}

      {/* Botón "Sumar otra foto" */}
      <Button
        type="button"
        variant="outline"
        onClick={onAddPhoto}
        className="w-full"
      >
        <Camera className="size-4" />
        Sumar otra foto del mismo ticket
      </Button>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground space-y-2">
          <Sparkles className="size-6 mx-auto opacity-60" />
          <p>La IA no detectó productos en este ticket.</p>
          <Button onClick={onAddBlank} variant="outline" size="sm">
            Agregar item a mano
          </Button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {matchedCount} item{matchedCount === 1 ? "" : "s"} matcheado
            {matchedCount === 1 ? "" : "s"} al catálogo
            {newCount > 0 && ` · ${newCount} se crearán como tipo nuevo`}
            {unmatchedCount > 0 &&
              ` · ${unmatchedCount} sin tipo (no se cargarán)`}
            .
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key}>
                <ReviewRowItem
                  row={r}
                  onUpdate={(patch) => onUpdate(r.key, patch)}
                  onSetTypeText={(text) => onSetTypeText(r.key, text)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAddBlank}
        className="w-full"
      >
        <Plus className="size-4" />
        Agregar item suelto
      </Button>

      {confirmError && (
        <p
          role="alert"
          className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
        >
          {confirmError}
        </p>
      )}

      {confirming && (
        <p className="text-xs text-muted-foreground text-center">Cargando…</p>
      )}
    </div>
  );
}

function ReviewRowItem({
  row,
  onUpdate,
  onSetTypeText,
}: {
  row: ReviewRow;
  onUpdate: (patch: Partial<ReviewRow>) => void;
  onSetTypeText: (text: string) => void;
}) {
  const hasMatch = row.productId !== null;
  const isUnmatched = row.include && !hasMatch && row.typeText.trim().length === 0;
  const willCreate = row.include && !hasMatch && row.typeText.trim().length > 0;

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        !row.include
          ? "border-border bg-muted/30 opacity-60"
          : isUnmatched
            ? "border-warning/30 bg-warning/5"
            : willCreate
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onUpdate({ include: !row.include })}
          className={`size-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
            row.include
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40"
          }`}
          aria-label={row.include ? "No incluir" : "Incluir"}
        >
          {row.include && <Check className="size-4" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground truncate">
            {row.source.raw_name || "Item nuevo"}
          </div>
          <div className="mt-1.5 flex items-start gap-2">
            <Input
              list="catalog-types"
              value={row.typeText}
              onChange={(e) => onSetTypeText(e.target.value)}
              placeholder="Tipo del catálogo"
              className="h-8 text-sm"
            />
          </div>
          <div className="mt-1.5">
            <Input
              value={row.variantText}
              onChange={(e) => onUpdate({ variantText: e.target.value })}
              placeholder="Variante (opcional)"
              className="h-8 text-sm"
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={row.quantity}
              onChange={(e) =>
                onUpdate({ quantity: Number(e.target.value) || 0 })
              }
              className="h-8 text-sm w-20"
            />
            <select
              value={row.unit}
              onChange={(e) => onUpdate({ unit: e.target.value as Unit })}
              className="h-8 px-2 rounded-md border border-input bg-transparent text-sm"
            >
              {Object.entries(UNIT_LABELS).map(([u, label]) => (
                <option key={u} value={u}>
                  {label}
                </option>
              ))}
            </select>
            {row.source.price !== null && (
              <span className="text-xs text-muted-foreground ml-auto">
                ${row.source.price}
              </span>
            )}
          </div>

          {hasMatch && (
            <p className="text-[10px] text-primary mt-1.5 inline-flex items-center gap-1">
              <Check className="size-2.5" />
              Matchea con un tipo existente
            </p>
          )}
          {willCreate && (
            <p className="text-[10px] text-primary mt-1.5 inline-flex items-center gap-1">
              <Sparkles className="size-2.5" />
              Se va a crear como tipo nuevo
            </p>
          )}
          {isUnmatched && (
            <p className="text-[10px] text-warning-foreground/80 mt-1.5 inline-flex items-center gap-1">
              <TriangleAlert className="size-2.5" />
              Sin tipo — no se va a cargar
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onUpdate({ include: false })}
          aria-label="Excluir"
          className="size-7 shrink-0 text-muted-foreground"
          title="Excluir este item"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function buildRows(
  items: ReceiptItem[],
  catalogByLowerName: Map<string, CatalogEntry>,
): ReviewRow[] {
  return items.map((item, idx) => {
    const suggested = item.suggested_type ?? "";
    const suggestedLower = suggested.toLowerCase();
    const matched = suggested
      ? catalogByLowerName.get(suggestedLower)
      : undefined;
    return {
      key: `r-${Date.now()}-${idx}`,
      source: item,
      include: true,
      productId: matched?.id ?? null,
      typeText: matched ? matched.name : suggested,
      variantText: item.variant ?? "",
      quantity: item.quantity,
      unit: item.unit,
    };
  });
}

function PreviewImage({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Vista previa del ticket"
      className="w-full max-h-64 object-contain rounded-xl bg-muted"
    />
  );
}

function formatPrice(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Comprime + redimensiona la imagen elegida. Devuelve base64 puro (sin
 * prefijo data:) listo para mandar al endpoint.
 */
async function prepareImage(file: File): Promise<{
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  previewUrl: string;
}> {
  const isJpeg = file.type === "image/jpeg";

  const dataUrl = await readFileAsDataUrl(file);

  if (!isJpeg || file.size <= 800 * 1024) {
    const compressed = await compressViaCanvas(dataUrl);
    return {
      base64: compressed.base64,
      mediaType: "image/jpeg",
      previewUrl: compressed.dataUrl,
    };
  }

  const compressed = await compressViaCanvas(dataUrl);
  return {
    base64: compressed.base64,
    mediaType: "image/jpeg",
    previewUrl: compressed.dataUrl,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No pudimos leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function compressViaCanvas(
  dataUrl: string,
): Promise<{ base64: string; dataUrl: string }> {
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pudimos abrir el canvas.");
  ctx.drawImage(img, 0, 0, width, height);

  const outDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = outDataUrl.split(",")[1] ?? "";
  return { base64, dataUrl: outDataUrl };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No pudimos cargar la imagen."));
    img.src = src;
  });
}
