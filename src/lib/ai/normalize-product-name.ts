/**
 * Normaliza datos crudos de Open Food Facts a algo legible y consistente.
 *
 * Open Food Facts a veces devuelve nombres en formato "INDUSTRIAL":
 *  - "LECHE ENTERA SACHET 1.5GMS LA SERENISIMA"
 *  - "YOGUR ENT DDL YOGS 200G CHOCOLATE"
 *  - "MANT C SAL 100GR LA SER"
 *
 * Claude Haiku 4.5 los transforma en algo más amigable y, de paso, sugiere
 * el tipo genérico al que pertenecen (útil para matchear contra el catálogo
 * del hogar).
 *
 * Server-only — usa la API key de Anthropic.
 */

import Anthropic from "@anthropic-ai/sdk";

export type NormalizeInput = {
  /** Nombre crudo de OFF (ej. "LECHE ENTERA SACHET 1.5GMS LA SERENISIMA"). */
  rawName: string | null;
  /** Marca cruda de OFF (puede venir con varias separadas por coma). */
  rawBrand: string | null;
  /** Categoría humanizada que ya armamos en el lookup OFF. */
  category: string | null;
  /** Cantidad/formato del producto (ej. "1 L", "200 g"). */
  quantityDescription: string | null;
};

export type NormalizedProduct = {
  /** Nombre limpio del lote, incluyendo marca + cantidad. */
  name: string;
  /** Marca con capitalización correcta. */
  brand: string;
  /** Tipo genérico sugerido para el catálogo (ej. "Leche entera"). */
  suggestedType: string;
};

const SYSTEM_PROMPT = `Sos un asistente que normaliza nombres de productos argentinos. Recibís datos crudos de Open Food Facts y devolvés tres strings:

1. **name** — nombre limpio del producto, incluyendo marca y cantidad:
   - Capitalización normal (ni TODO MAYÚSCULAS ni todo minúsculas).
   - Reemplazá abreviaturas raras: SACH→sachet, GMS/GR→g, LT→L, ENT→entera, DDL→Dulce de Leche, C→con, S→sin, AZUC→azúcar.
   - Conservá la marca pero correctamente capitalizada.
   - Si tenés la cantidad en \`quantity\`, incluila al final ("1 L", "200 g", "500 ml").
   - Ejemplos:
     "LECHE ENTERA SACHET 1.5GMS LA SERENISIMA" + qty "1 L" → "Leche entera sachet La Serenísima 1 L"
     "YOGUR ENT DDL YOGS 200G CHOC" → "Yogur entero dulce de leche y chocolate Yogs 200 g"
     "MANT C SAL 100GR LA SER" → "Manteca con sal La Serenísima 100 g"

2. **brand** — solo la marca, capitalización correcta (ej. "La Serenísima", "Yogs", "Arcor"). Si no hay marca clara o no se distingue, devolvé "".

3. **suggested_type** — el tipo genérico del producto para el catálogo doméstico. SIN marca, SIN cantidad, en singular y minúscula inicial donde corresponda:
   - "Leche entera"
   - "Yogur"
   - "Manteca"
   - "Dulce de leche"
   - "Pan rallado"
   - Si no podés determinar, devolvé "".

No devuelvas texto extra ni explicaciones — solo el JSON exacto del schema.`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey });
}

/**
 * Llama a Claude para normalizar. Si falla (sin API key, error de red),
 * devuelve null y el caller usa los datos crudos.
 */
export async function normalizeProductName(
  input: NormalizeInput,
): Promise<NormalizedProduct | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Sin nombre crudo no hay nada que normalizar.
  const rawName = input.rawName?.trim();
  if (!rawName) return null;

  const userText = [
    `name: ${rawName}`,
    input.rawBrand && `brand: ${input.rawBrand}`,
    input.category && `category: ${input.category}`,
    input.quantityDescription && `quantity: ${input.quantityDescription}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = getClient();
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 250,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              brand: { type: "string" },
              suggested_type: { type: "string" },
            },
            required: ["name", "brand", "suggested_type"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = response.parsed_output as
      | { name?: unknown; brand?: unknown; suggested_type?: unknown }
      | null;
    if (!parsed) return null;

    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const brand = typeof parsed.brand === "string" ? parsed.brand.trim() : "";
    const suggestedType =
      typeof parsed.suggested_type === "string"
        ? parsed.suggested_type.trim()
        : "";

    if (!name) return null;

    return {
      name,
      brand,
      suggestedType,
    };
  } catch (err) {
    console.error("[ai/normalize-product-name]", err);
    return null;
  }
}
