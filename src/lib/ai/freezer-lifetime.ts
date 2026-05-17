/**
 * Sugiere días máximos de freezer para un producto usando Claude Haiku 4.5.
 *
 * One-shot, JSON estructurado vía `messages.parse()` + `output_config.format`
 * con json_schema (la SDK valida la respuesta contra el schema).
 *
 * No usamos prompt caching: el system prompt es chico (~400 tokens) y Haiku
 * 4.5 necesita ≥ 4096 tokens de prefijo para cachear.
 */

import Anthropic from "@anthropic-ai/sdk";

export type FreezerSuggestionInput = {
  name: string;
  brand?: string | null;
  category?: string | null;
};

export type FreezerSuggestionResult = {
  /** Días máximos sugeridos en freezer doméstico (-18°C). 0 = no se recomienda freezar. */
  days: number;
  /** Explicación breve en español, máx ~140 chars. */
  reason: string;
  /** Confianza en la sugerencia. Para items raros o ambiguos será "low". */
  confidence: "low" | "medium" | "high";
};

const SYSTEM_PROMPT = `Sos un experto en seguridad alimentaria y conservación doméstica.

Para cada producto que recibís, sugerí cuántos días máximos puede mantenerse \
freezado en un freezer doméstico estándar (-18°C / 0°F) manteniendo calidad \
razonable. Asumí que el producto se freezó correctamente (envasado al vacío \
o en bolsa hermética, lo más pronto posible después de la compra/cocción).

Devolvé tu mejor estimación basada en guías típicas (USDA, ANMAT, etc):

- Carnes crudas: pollo entero ~270, pollo trozado ~270, vacuna entera ~365, \
  vacuna trozada ~180, picada ~120, pescado magro ~180, pescado graso ~90.
- Comidas cocidas: sopas/guisos ~90, carnes cocidas ~90.
- Panificados: pan ~90, masas crudas ~90.
- Lácteos: manteca ~270, queso duro ~180, queso blando ~120 (textura cambia).
- Verduras blanqueadas: ~300; sin blanquear: ~30-60.
- Frutas: ~365 (calidad baja después).
- Productos comerciales congelados: respetar la fecha del envase (no aplicable acá).

Si el producto no se recomienda freezar (huevos en cáscara, lechuga fresca, \
leche en sachet sin abrir, frutas con alto contenido de agua tipo sandía, \
mayonesa, salsas con crema, etc.), devolvé days: 0 y explicá brevemente.

Si no podés identificar el producto con certeza, devolvé tu mejor estimación \
genérica y poné confidence: "low".

Reason: máx 140 caracteres, en español rioplatense, sin emojis ni markdown.`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "integer",
      description:
        "Días máximos en freezer doméstico. 0 si no se recomienda freezar.",
    },
    reason: {
      type: "string",
      description:
        "Explicación breve en español rioplatense, máx 140 caracteres.",
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description:
        "Confianza en la sugerencia. low cuando el producto es raro o ambiguo.",
    },
  },
  required: ["days", "reason", "confidence"],
  additionalProperties: false,
} as const;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el entorno (.env.local local, env vars en Vercel).",
    );
  }
  return new Anthropic({ apiKey });
}

export async function suggestFreezerLifetime(
  input: FreezerSuggestionInput,
): Promise<FreezerSuggestionResult> {
  const client = getClient();

  const userText = [
    `Producto: ${input.name}`,
    input.brand && `Marca: ${input.brand}`,
    input.category && `Categoría: ${input.category}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: JSON_SCHEMA,
      },
    },
  });

  // El SDK tipa parsed_output como `never` sin un generic — la response viene
  // validada contra nuestro schema, así que casteamos al shape esperado.
  const parsed = response.parsed_output as
    | { days?: unknown; reason?: unknown; confidence?: unknown }
    | null;

  if (!parsed) {
    throw new Error("Claude no devolvió un JSON parseable.");
  }

  // Sanitizamos por las dudas — el schema no impone numerical constraints.
  const days = clamp(Number(parsed.days), 0, 730);
  const reason = String(parsed.reason ?? "").trim().slice(0, 200);
  const confidence: FreezerSuggestionResult["confidence"] =
    parsed.confidence === "high" || parsed.confidence === "medium"
      ? parsed.confidence
      : "low";

  return { days, reason, confidence };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
