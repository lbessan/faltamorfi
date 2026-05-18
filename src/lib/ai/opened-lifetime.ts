/**
 * Sugiere días máximos que un producto puede estar abierto en la heladera
 * (4°C) antes de que pierda calidad o se vuelva inseguro.
 *
 * One-shot, JSON estructurado vía `messages.parse()` + `output_config.format`
 * con json_schema (la SDK valida la respuesta contra el schema).
 *
 * Mismo patrón que `freezer-lifetime`: Haiku 4.5, sin prompt caching.
 */

import Anthropic from "@anthropic-ai/sdk";

export type OpenedSuggestionInput = {
  name: string;
  brand?: string | null;
  category?: string | null;
};

export type OpenedSuggestionResult = {
  /** Días máximos sugeridos en heladera (4°C) una vez abierto el envase. 0 = no aplica / consumir el mismo día. */
  days: number;
  /** Explicación breve en español, máx ~140 chars. */
  reason: string;
  /** Confianza en la sugerencia. Para items raros o ambiguos será "low". */
  confidence: "low" | "medium" | "high";
};

const SYSTEM_PROMPT = `Sos un experto en seguridad alimentaria y conservación doméstica.

Para cada producto que recibís, sugerí cuántos días máximos puede mantenerse \
en la heladera (4°C) UNA VEZ ABIERTO el envase, manteniendo calidad y seguridad \
razonables. Asumí que se vuelve a cerrar bien después de cada uso (tapa, film, \
recipiente hermético) y que se mantiene la cadena de frío.

Devolvé tu mejor estimación basada en guías típicas (USDA, ANMAT, fabricantes):

- Lácteos abiertos: leche ~5, yogur ~7, crema de leche ~5, manteca ~30, \
  queso blando ~7, queso duro ~21, queso untable ~14, ricota ~3.
- Fiambres abiertos al corte: jamón cocido ~5, jamón crudo ~21, salame ~21, \
  bondiola ~14, mortadela ~5.
- Conservas abiertas (pasadas a frasco/tupper): tomate ~5, atún ~2-3, choclo ~3, \
  arvejas ~3, frutas en almíbar ~7, palmitos ~5.
- Salsas/condimentos abiertos: mayonesa ~60, ketchup ~180, mostaza ~365, \
  salsa de soja ~365, salsa golf casera ~3, mermelada ~30, dulce de leche ~30, \
  manteca de maní ~90.
- Bebidas abiertas: jugo de fruta ~5, gaseosa ~3 (pierde gas), vino tinto ~3, \
  vino blanco ~5, cerveza ~1.
- Huevos: una vez cascados/batidos ~2 (en recipiente cerrado).
- Carnes/pescados crudos abiertos (sacados del envase): consumir en 1-2 días \
  o freezar.
- Comidas cocidas (sobras, viandas): ~3-4 días.

Si el producto se consume normalmente al instante de abrir (yogures individuales, \
latas chicas que se vacían) o no aplica el concepto (productos secos como arroz, \
fideos, harinas), devolvé days: 0 y explicá brevemente.

Si no podés identificar el producto con certeza, devolvé tu mejor estimación \
genérica y poné confidence: "low".

Reason: máx 140 caracteres, en español rioplatense, sin emojis ni markdown.`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "integer",
      description:
        "Días máximos en heladera una vez abierto. 0 si no aplica o se consume al instante.",
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

export async function suggestOpenedLifetime(
  input: OpenedSuggestionInput,
): Promise<OpenedSuggestionResult> {
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
  const days = clamp(Number(parsed.days), 0, 365);
  const reason = String(parsed.reason ?? "").trim().slice(0, 200);
  const confidence: OpenedSuggestionResult["confidence"] =
    parsed.confidence === "high" || parsed.confidence === "medium"
      ? parsed.confidence
      : "low";

  return { days, reason, confidence };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
