/**
 * Asigna department + icon + unidad sugerida a un tipo de producto usando
 * Claude Haiku 4.5. Pensado para correr server-side al crear un tipo nuevo.
 *
 * No usamos prompt caching: el system prompt es chico (~600 tokens) y el
 * minimum cacheable de Haiku 4.5 es 4096 tokens.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  DEPARTMENTS,
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS,
  UNITS,
  type Department,
  type Unit,
} from "@/lib/database.types";

export type CategorizeInput = {
  name: string;
  brand?: string | null;
  /** Categoría humanizada de Open Food Facts (si vino del escaneo). */
  offCategory?: string | null;
};

export type CategorizeResult = {
  department: Department;
  icon: string;
  unit: Unit;
};

// Iconos comunes válidos en lucide-react para ofrecerle a la IA.
// Si Claude devuelve uno fuera de esta lista, hacemos fallback al icono
// del departamento (DEPARTMENT_ICONS).
const ALLOWED_ICONS = [
  "Milk",
  "Beef",
  "Drumstick",
  "Fish",
  "Ham",
  "Sandwich",
  "Croissant",
  "Cookie",
  "Wheat",
  "Apple",
  "Banana",
  "Citrus",
  "Cherry",
  "Grape",
  "Carrot",
  "Salad",
  "Leaf",
  "Soup",
  "Droplet",
  "CupSoda",
  "GlassWater",
  "Coffee",
  "Wine",
  "Beer",
  "Snowflake",
  "Pizza",
  "Candy",
  "IceCream",
  "SprayCan",
  "Brush",
  "Trash2",
  "Package",
  "ShowerHead",
  "Sun",
  "Pill",
  "Bandage",
  "Thermometer",
  "PawPrint",
  "Baby",
  "Battery",
  "Flame",
  "Lightbulb",
  "Wrench",
] as const;

const SYSTEM_PROMPT = `Sos un experto en supermercados argentinos. Para cada producto, asignás:

1. **department** — el departamento del super al que pertenece. Valores válidos:
${DEPARTMENTS.map((d) => `- ${d}: ${DEPARTMENT_LABELS[d]}`).join("\n")}

2. **icon** — un icono de Lucide que lo represente visualmente. Valores válidos:
${ALLOWED_ICONS.join(", ")}

3. **unit** — la unidad típica de venta. Valores válidos: ${UNITS.join(", ")}
   - un: unidades sueltas
   - kg, g: a granel por peso
   - l, ml: líquidos
   - paq: paquete con varias unidades adentro

Si no estás seguro del producto, usá department: "other" e icon: "Package".`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  }
  return new Anthropic({ apiKey });
}

export async function categorizeProduct(
  input: CategorizeInput,
): Promise<CategorizeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Sin clave configurada, devolvemos defaults seguros.
    return fallback();
  }

  const client = getClient();

  const userText = [
    `Producto: ${input.name}`,
    input.brand && `Marca: ${input.brand}`,
    input.offCategory && `Categoría detectada: ${input.offCategory}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              department: { type: "string", enum: [...DEPARTMENTS] },
              icon: { type: "string", enum: [...ALLOWED_ICONS] },
              unit: { type: "string", enum: [...UNITS] },
            },
            required: ["department", "icon", "unit"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = response.parsed_output as
      | { department?: unknown; icon?: unknown; unit?: unknown }
      | null;

    if (!parsed) return fallback();

    return {
      department: normalizeDepartment(parsed.department),
      icon: normalizeIcon(parsed.icon, normalizeDepartment(parsed.department)),
      unit: normalizeUnit(parsed.unit),
    };
  } catch (err) {
    console.error("[ai/categorize-product]", err);
    return fallback();
  }
}

function fallback(): CategorizeResult {
  return { department: "other", icon: "Package", unit: "un" };
}

function normalizeDepartment(value: unknown): Department {
  if (typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value)) {
    return value as Department;
  }
  return "other";
}

function normalizeIcon(value: unknown, department: Department): string {
  if (typeof value === "string" && (ALLOWED_ICONS as readonly string[]).includes(value)) {
    return value;
  }
  return DEPARTMENT_ICONS[department];
}

function normalizeUnit(value: unknown): Unit {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as Unit;
  }
  return "un";
}
