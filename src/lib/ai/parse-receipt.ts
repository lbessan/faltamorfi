/**
 * Parser de tickets de supermercado argentinos usando Claude Sonnet 4.6 con
 * vision.
 *
 * - Recibe la imagen del ticket como base64 (sin el prefijo data:).
 * - Devuelve un objeto estructurado con cada producto, intentando matchear
 *   contra los tipos del catálogo del hogar (le pasamos la lista de tipos
 *   conocidos como contexto).
 * - Items que no son productos (totales, descuentos, impuestos) se filtran.
 *
 * Server-only — usa la API key de Anthropic.
 */

import Anthropic from "@anthropic-ai/sdk";
import { UNITS, type Unit } from "@/lib/database.types";

export type ReceiptItem = {
  /** Texto exacto del ticket. */
  raw_name: string;
  /** Cantidad detectada. Default 1. */
  quantity: number;
  /** Unidad inferida. */
  unit: Unit;
  /** Precio total del item en ARS si se detectó. */
  price: number | null;
  /** Marca si se identifica. */
  brand: string | null;
  /** Tipo genérico sugerido para el catálogo (ej. "Leche entera"). */
  suggested_type: string | null;
};

export type ParsedReceipt = {
  items: ReceiptItem[];
  subtotal: number | null;
  total: number | null;
  store: string | null;
  /** Pista de error legible si la imagen es ilegible o no es un ticket. */
  error_hint: string | null;
};

const SYSTEM_PROMPT = `Sos un asistente experto en analizar tickets de supermercados argentinos. Recibís una foto y devolvés un JSON estructurado con cada producto comprado.

# Qué incluir

Para cada producto detectado en el ticket, devolvé un item con:

- **raw_name**: el texto exacto como aparece en el ticket (mayúsculas, abreviaturas, etc).
- **quantity**: cantidad numérica. Si el ticket muestra "2 x Leche..." es quantity 2. Si no se especifica, 1.
- **unit**: "un" (default), "kg", "g", "l", "ml", o "paq". Adiviná según contexto. Productos a granel suelen ser kg o g; líquidos l o ml; sino "un".
- **price**: precio TOTAL del item en pesos (ARS), incluyendo el "x cantidad". Decimal con punto. Null si no se ve claro.
- **brand**: marca del producto si se identifica (ej. "La Serenísima"). Null si no.
- **suggested_type**: tipo genérico para el catálogo doméstico en español rioplatense, sin marca ni cantidad. Ejemplos:
  - "Leche entera", "Yogur", "Manteca"
  - "Carne picada", "Pollo entero"
  - "Pan lactal", "Galletitas dulces"
  - "Detergente para vajilla", "Lavandina"
  - "Papel higiénico", "Pasta dental"
  Null si no podés determinar.

# Qué IGNORAR (no incluir como items)

- Subtotales, totales, descuentos, impuestos, IVA, propinas.
- Tipo de pago, vuelto, código de barras del ticket.
- Encabezados (nombre del supermercado, dirección, CUIT, fecha, hora).
- Mensajes de fidelidad / publicidad ("gracias por su compra").
- Líneas vacías o ilegibles.

# Otros campos

- **subtotal**, **total**: si los podés leer, valores numéricos en ARS. Sino null.
- **store**: nombre del supermercado (Coto, Carrefour, Día, La Anónima, Vea, Disco, etc.). Sino null.
- **error_hint**: SOLO si la foto está borrosa, no es un ticket, o no podés extraer nada. En ese caso devolvé items: [] y poné acá una pista corta ("foto borrosa", "no parece un ticket de super"). Sino null.

Sé fiel al ticket. No inventes precios ni cantidades. Si dudás, dejá null antes que adivinar mal.`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey });
}

export async function parseReceipt(input: {
  /** Imagen del ticket en base64 (sin prefijo data:image/...). */
  imageBase64: string;
  /** MIME type ("image/jpeg" | "image/png" | "image/webp"). */
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}): Promise<ParsedReceipt> {
  const client = getClient();

  const response = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text:
              "Analizá este ticket. Devolvé el JSON estructurado con todos los productos comprados.",
          },
        ],
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  raw_name: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string", enum: [...UNITS] },
                  price: { type: ["number", "null"] },
                  brand: { type: ["string", "null"] },
                  suggested_type: { type: ["string", "null"] },
                },
                required: [
                  "raw_name",
                  "quantity",
                  "unit",
                  "price",
                  "brand",
                  "suggested_type",
                ],
                additionalProperties: false,
              },
            },
            subtotal: { type: ["number", "null"] },
            total: { type: ["number", "null"] },
            store: { type: ["string", "null"] },
            error_hint: { type: ["string", "null"] },
          },
          required: ["items", "subtotal", "total", "store", "error_hint"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = response.parsed_output as ParsedReceipt | null;
  if (!parsed) {
    return {
      items: [],
      subtotal: null,
      total: null,
      store: null,
      error_hint: "No pudimos parsear la respuesta del modelo.",
    };
  }

  // Saneamos por las dudas — el schema ya restringe pero validamos los tipos.
  const items: ReceiptItem[] = (parsed.items ?? [])
    .filter(
      (i) =>
        typeof i.raw_name === "string" &&
        i.raw_name.trim().length > 0 &&
        typeof i.quantity === "number" &&
        i.quantity > 0,
    )
    .map((i) => ({
      raw_name: i.raw_name.trim(),
      quantity: Math.max(0.01, Number(i.quantity)),
      unit: ((UNITS as readonly string[]).includes(i.unit)
        ? i.unit
        : "un") as Unit,
      price:
        typeof i.price === "number" && Number.isFinite(i.price)
          ? i.price
          : null,
      brand: typeof i.brand === "string" && i.brand.trim() ? i.brand.trim() : null,
      suggested_type:
        typeof i.suggested_type === "string" && i.suggested_type.trim()
          ? i.suggested_type.trim()
          : null,
    }));

  return {
    items,
    subtotal:
      typeof parsed.subtotal === "number" ? parsed.subtotal : null,
    total: typeof parsed.total === "number" ? parsed.total : null,
    store:
      typeof parsed.store === "string" && parsed.store.trim()
        ? parsed.store.trim()
        : null,
    error_hint:
      typeof parsed.error_hint === "string" && parsed.error_hint.trim()
        ? parsed.error_hint.trim()
        : null,
  };
}
