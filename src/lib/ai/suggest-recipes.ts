/**
 * Sugerencia de recetas con lo que tenés en el inventario, priorizando
 * lotes próximos a vencer (la filosofía de la app: usá lo que tenés antes
 * de comprar / antes de tirar).
 *
 * Usamos Claude Haiku 4.5 con `messages.parse()` + json_schema. El system
 * prompt es chico (<800 tokens) así que sin prompt caching.
 *
 * Server-only: usa ANTHROPIC_API_KEY.
 */

import Anthropic from "@anthropic-ai/sdk";

export type StockItemForRecipes = {
  /** Nombre del tipo (Galletitas, Fideos, Pollo, etc.). */
  product_name: string;
  /** Departamento del super (dairy, meat, produce, etc.). */
  department: string | null;
  /** Cantidad total en stock. */
  quantity: number;
  unit: string;
  /** Lotes con detalle, ordenados por urgencia (vencen primero). */
  lots: Array<{
    quantity: number;
    /** Subtipo del lote (ej. "tallarines", "chips de chocolate"). */
    variant: string | null;
    brand: string | null;
    /** Días hasta vencer. Negativo si ya venció. Null si no aplica. */
    days_until_expiry: number | null;
    /** Estado del lote ("frozen", "opened", null). */
    state: "frozen" | "opened" | null;
  }>;
};

export type RecipeSuggestion = {
  /** Nombre breve del plato. */
  name: string;
  /** Descripción corta (1-2 oraciones). */
  description: string;
  /**
   * Razón por la que la sugerimos AHORA (ej. "usás el pollo que vence en
   * 2 días + el queso ya abierto"). Lo más importante para el usuario.
   */
  why_now: string;
  /** Tiempo estimado en minutos. */
  time_minutes: number;
  difficulty: "fácil" | "media" | "difícil";
  /** Ingredientes del stock que vas a usar. Solo los que están en el inventario. */
  uses_from_stock: Array<{
    /** Match contra product_name del catálogo. */
    product_name: string;
    /** Cantidad sugerida (texto: "150g", "1 paq", "2 unidades"). */
    quantity_text: string;
    /** Si aplica, qué variant/marca aprovecha el lote. */
    notes: string | null;
  }>;
  /** Ingredientes que faltan y habría que comprar / improvisar. */
  missing_ingredients: Array<{
    name: string;
    quantity_text: string;
    /** "imprescindible" si no se puede hacer sin él; "opcional" si es accesorio. */
    importance: "imprescindible" | "opcional";
  }>;
};

export type RecipesResult = {
  recipes: RecipeSuggestion[];
  /** Mensaje breve si pasó algo (ej. "casi no tenés stock"). Null si no. */
  note: string | null;
};

const SYSTEM_PROMPT = `Sos un asistente de cocina argentina. Sugerís platos caseros usando lo que la persona ya tiene en su despensa/heladera/freezer.

# Prioridades

1. **Usá lo que vence pronto**: si hay lotes con days_until_expiry ≤ 7 o lotes con state="opened", priorizalos. Tu primer reflejo: ¿qué se está por arruinar y cómo evitamos tirarlo?
2. **Usá lo del freezer**: lotes con state="frozen" deberían figurar — la idea es rotar.
3. **Comidas reales argentinas**: tortilla, milanesas, guiso, fideos con tuco, arroz con pollo, ensalada, omelette, sopa, pizza casera. Sin nombres pretenciosos.
4. **Devolvé 3 recetas** salvo que el stock sea muy pobre (puede ser 1-2). No inventes ingredientes que no están en el stock.

# Estructura de cada receta

- **name**: nombre corto del plato. Ej.: "Tortilla de papa", "Fideos con tuco", "Milanesas al horno".
- **description**: 1-2 oraciones describiendo el plato. Sin lista de pasos.
- **why_now**: por qué te conviene HOY. Mencioná lotes urgentes/abiertos. Ej.: "Aprovechás el pollo abierto en la heladera y los morrones que vencen mañana." Si no hay urgencia, deciles algo neutro ("Buena para una cena rápida").
- **time_minutes**: estimación realista en minutos.
- **difficulty**: "fácil" | "media" | "difícil".
- **uses_from_stock**: array con SOLO productos que aparecen en el stock recibido. Para cada uno: product_name (matcheando exacto), quantity_text humano ("200g", "1 cebolla", "2 huevos"), notes si aprovecha un lote particular ("usá la mozzarella abierta", "el aceite de oliva queda mejor"). Si no hay nota, null.
- **missing_ingredients**: lo que necesitarías agregar y NO está en el stock. Texto libre. Marca "imprescindible" u "opcional".

# Reglas

- No repitas un mismo product_name en uses_from_stock (consolidar en un item).
- Si el stock está vacío o muy escaso, devolvé recipes: [] y note: "Hay poco stock — cargá productos o pasá por compras antes."
- Lenguaje rioplatense, informal, sin emojis.`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          why_now: { type: "string" },
          time_minutes: { type: "integer" },
          difficulty: {
            type: "string",
            enum: ["fácil", "media", "difícil"],
          },
          uses_from_stock: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                quantity_text: { type: "string" },
                notes: { type: ["string", "null"] },
              },
              required: ["product_name", "quantity_text", "notes"],
              additionalProperties: false,
            },
          },
          missing_ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity_text: { type: "string" },
                importance: {
                  type: "string",
                  enum: ["imprescindible", "opcional"],
                },
              },
              required: ["name", "quantity_text", "importance"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "name",
          "description",
          "why_now",
          "time_minutes",
          "difficulty",
          "uses_from_stock",
          "missing_ingredients",
        ],
        additionalProperties: false,
      },
    },
    note: { type: ["string", "null"] },
  },
  required: ["recipes", "note"],
  additionalProperties: false,
} as const;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  }
  return new Anthropic({ apiKey });
}

export async function suggestRecipes(
  stock: StockItemForRecipes[],
): Promise<RecipesResult> {
  if (stock.length === 0) {
    return {
      recipes: [],
      note: "Hay poco stock — cargá productos o pasá por compras antes.",
    };
  }

  const client = getClient();

  // Serializamos el stock en un formato compacto pero legible para el modelo.
  const stockText = stock
    .map((p) => {
      const lots = p.lots
        .map((l) => {
          const parts: string[] = [`${l.quantity} ${p.unit}`];
          if (l.variant) parts.push(`variante: ${l.variant}`);
          if (l.brand) parts.push(`marca: ${l.brand}`);
          if (l.state === "frozen") parts.push("EN FREEZER");
          if (l.state === "opened") parts.push("ABIERTO en heladera");
          if (l.days_until_expiry !== null) {
            if (l.days_until_expiry < 0) {
              parts.push(`VENCIDO hace ${Math.abs(l.days_until_expiry)}d`);
            } else if (l.days_until_expiry === 0) {
              parts.push("VENCE HOY");
            } else if (l.days_until_expiry <= 7) {
              parts.push(`vence en ${l.days_until_expiry}d`);
            }
          }
          return `    - ${parts.join(" · ")}`;
        })
        .join("\n");
      const dept = p.department ? ` [${p.department}]` : "";
      return `${p.product_name}${dept} — total ${p.quantity} ${p.unit}\n${lots}`;
    })
    .join("\n\n");

  const userText = `Acá está mi stock actual:\n\n${stockText}\n\nSugerime qué cocinar.`;

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    output_config: {
      format: {
        type: "json_schema",
        schema: JSON_SCHEMA,
      },
    },
  });

  const parsed = response.parsed_output as RecipesResult | null;
  if (!parsed) {
    return {
      recipes: [],
      note: "No pudimos generar sugerencias en este momento.",
    };
  }

  return parsed;
}
