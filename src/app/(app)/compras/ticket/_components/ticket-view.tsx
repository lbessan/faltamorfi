"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
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

type Mode =
  | { kind: "pick" }
  | { kind: "uploading"; previewUrl: string }
  | { kind: "analyzing"; previewUrl: string }
  | {
      kind: "review";
      previewUrl: string;
      parsed: ParsedReceipt;
      rows: ReviewRow[];
    }
  | { kind: "error"; previewUrl: string | null; message: string };

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

    try {
      const { base64, mediaType, previewUrl } = await prepareImage(file);
      setMode({ kind: "analyzing", previewUrl });

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

      const rows = buildRows(parsed.items, catalog, catalogByLowerName);

      setMode({ kind: "review", previewUrl, parsed, rows });
    } catch (err) {
      setMode({
        kind: "error",
        previewUrl: null,
        message:
          err instanceof Error
            ? err.message
            : "No pudimos procesar la imagen.",
      });
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    if (mode.kind !== "review") return;
    setMode({
      ...mode,
      rows: mode.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
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

  function handleConfirm() {
    if (mode.kind !== "review") return;
    setConfirmError(null);

    const inputs: ReceiptItemInput[] = mode.rows
      .filter((r) => r.include && r.typeText.trim().length > 0)
      .map((r) => ({
        product_id: r.productId,
        new_type_name: r.productId ? null : r.typeText.trim(),
        raw_name: r.source.raw_name,
        quantity: r.quantity,
        unit: r.unit,
        brand: r.source.brand,
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
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex-1 px-4 py-4 space-y-4 pb-32">
        {mode.kind === "pick" && <PickState onPick={openPicker} />}

        {mode.kind === "analyzing" && (
          <AnalyzingState previewUrl={mode.previewUrl} />
        )}

        {mode.kind === "uploading" && (
          <AnalyzingState previewUrl={mode.previewUrl} />
        )}

        {mode.kind === "error" && (
          <ErrorState
            message={mode.message}
            onRetry={openPicker}
            previewUrl={mode.previewUrl}
          />
        )}

        {mode.kind === "review" && (
          <ReviewState
            previewUrl={mode.previewUrl}
            parsed={mode.parsed}
            rows={mode.rows}
            confirming={confirming}
            confirmError={confirmError}
            onUpdate={updateRow}
            onSetTypeText={setTypeText}
            onAddBlank={() => {
              setMode({
                ...mode,
                rows: [
                  ...mode.rows,
                  {
                    key: `new-${Date.now()}`,
                    source: {
                      raw_name: "",
                      quantity: 1,
                      unit: "un",
                      price: null,
                      brand: null,
                      suggested_type: null,
                    },
                    include: true,
                    productId: null,
                    typeText: "",
                    quantity: 1,
                    unit: "un",
                  },
                ],
              });
            }}
            onRetry={openPicker}
          />
        )}
      </div>

      {mode.kind === "review" && (
        <div className="fixed bottom-16 inset-x-0 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t border-border z-10">
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
              {mode.rows.filter(
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
          Funciona mejor con buena luz y el ticket plano. Si es muy largo,
          podés sacar varias fotos y cargarlas una a una.
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

function AnalyzingState({ previewUrl }: { previewUrl: string }) {
  return (
    <div className="space-y-3">
      <PreviewImage src={previewUrl} />
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Analizando el ticket…
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
  onRetry,
}: {
  message: string;
  previewUrl: string | null;
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
  previewUrl,
  parsed,
  rows,
  confirming,
  confirmError,
  onUpdate,
  onSetTypeText,
  onAddBlank,
  onRetry,
}: {
  previewUrl: string;
  parsed: ParsedReceipt;
  rows: ReviewRow[];
  confirming: boolean;
  confirmError: string | null;
  onUpdate: (key: string, patch: Partial<ReviewRow>) => void;
  onSetTypeText: (key: string, text: string) => void;
  onAddBlank: () => void;
  onRetry: () => void;
}) {
  const matchedCount = rows.filter(
    (r) => r.include && r.productId !== null,
  ).length;
  const newCount = rows.filter(
    (r) => r.include && r.productId === null && r.typeText.trim().length > 0,
  ).length;
  const unmatchedCount = rows.filter(
    (r) => r.include && r.typeText.trim().length === 0,
  ).length;

  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-border bg-card overflow-hidden">
        <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-accent/40">
          {parsed.store ? `Ticket de ${parsed.store}` : "Imagen del ticket"}
          {parsed.total !== null && ` · total $${parsed.total}`}
          {parsed.items.length > 0 && ` · ${parsed.items.length} items detectados`}
        </summary>
        <div className="border-t border-border p-2">
          <PreviewImage src={previewUrl} />
        </div>
      </details>

      {parsed.error_hint && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
          <TriangleAlert className="size-4 text-warning-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Atención:</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {parsed.error_hint}
            </p>
            <Button
              onClick={onRetry}
              variant="ghost"
              size="sm"
              className="mt-2 h-7"
            >
              <Camera className="size-3.5" />
              Probar con otra foto
            </Button>
          </div>
        </div>
      )}

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
            {newCount > 0 &&
              ` · ${newCount} se crearán como tipo nuevo`}
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
        + Agregar item suelto
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
        <p className="text-xs text-muted-foreground text-center">
          Cargando…
        </p>
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
              onChange={(e) =>
                onUpdate({ unit: e.target.value as Unit })
              }
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

          {/* Hints */}
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
// Image helpers
// ----------------------------------------------------------------------------

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

/**
 * Comprime + redimensiona la imagen elegida. Devuelve base64 puro (sin
 * prefijo data:) listo para mandar al endpoint.
 */
async function prepareImage(file: File): Promise<{
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  previewUrl: string;
}> {
  // PNG/WebP los pasamos tal cual (suelen ser screenshots). Los JPG los
  // recomprimimos con canvas para bajar tamaño.
  const isJpeg = file.type === "image/jpeg";

  const dataUrl = await readFileAsDataUrl(file);

  if (!isJpeg || file.size <= 800 * 1024) {
    // Igual los pasamos por canvas si están muy grandes, pero si no, va tal cual.
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

  // Redimensiono para que el lado más largo sea MAX_DIMENSION.
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

function buildRows(
  items: ReceiptItem[],
  catalog: CatalogEntry[],
  catalogByLowerName: Map<string, CatalogEntry>,
): ReviewRow[] {
  return items.map((it, i) => {
    let productId: string | null = null;
    let typeText = "";

    if (it.suggested_type) {
      const exact = catalogByLowerName.get(it.suggested_type.toLowerCase());
      if (exact) {
        productId = exact.id;
        typeText = exact.name;
      } else {
        // Fuzzy: substring tolerante
        const fuzzy = findFuzzy(it.suggested_type, catalog);
        if (fuzzy) {
          productId = fuzzy.id;
          typeText = fuzzy.name;
        } else {
          typeText = it.suggested_type;
        }
      }
    }

    return {
      key: `row-${i}-${it.raw_name}`,
      source: it,
      include: true,
      productId,
      typeText,
      quantity: it.quantity,
      unit: it.unit,
    };
  });
}

function findFuzzy(text: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const c of catalog) {
    const ctok = tokenize(c.name);
    if (ctok.length === 0) continue;
    const shared = ctok.filter((t) => tokens.includes(t)).length;
    if (shared === 0) continue;
    const bonus = text.toLowerCase().includes(c.name.toLowerCase()) ? 2 : 0;
    const score = shared + bonus;
    if (!best || score > best.score) best = { entry: c, score };
  }
  return best && best.score >= 1 ? best.entry : null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}
