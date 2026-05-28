/**
 * Tools que Claude puede invocar desde el chat del asistente.
 *
 * Cada tool tiene:
 * - definition: schema para la API de Anthropic.
 * - execute(input, ctx): handler server-side que devuelve texto/JSON
 *   serializado (volverá a Claude como tool_result).
 *
 * Todos los handlers reciben un `ctx` con el cliente Supabase ya autenticado
 * y el household_id del usuario, así RLS se aplica automáticamente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  DEPARTMENT_LABELS,
  isDepartment,
  type Department,
} from "@/lib/database.types";
import { listProducts, type ProductWithLots } from "@/lib/db/products";
import {
  addOrIncrementForProduct,
  listShoppingItems,
} from "@/lib/db/shopping";
import { effectiveExpiry } from "@/lib/expiry";

export type ToolContext = {
  supabase: SupabaseClient<Database>;
  householdId: string;
  userId: string | null;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

// ----------------------------------------------------------------------------
// list_inventory
// ----------------------------------------------------------------------------

const listInventoryDef: ToolDefinition = {
  name: "list_inventory",
  description:
    "Devuelve los productos con stock > 0 del inventario, agrupados por " +
    "departamento. Útil para preguntas como '¿qué tengo?' o '¿qué puedo " +
    "cocinar?'. Incluye marca y vencimiento del lote más próximo si aplica.",
  input_schema: {
    type: "object",
    properties: {
      department: {
        type: "string",
        description:
          "Filtrar por departamento. Opcional. Valores válidos: " +
          "dairy, meat, fish, deli, bakery, pantry, condiments, canned, " +
          "produce, beverages, alcohol, breakfast, snacks, frozen, cleaning, " +
          "personal_care, pharmacy, pets, baby, household, other.",
      },
    },
  },
};

const listInventory: ToolHandler = async (input, ctx) => {
  const products = await listProducts(ctx.supabase, ctx.householdId);
  const filtered = products.filter(
    (p) => p.is_active && Number(p.quantity) > 0,
  );

  const depFilter = typeof input.department === "string" ? input.department : null;
  const scoped = depFilter
    ? filtered.filter((p) => p.department === depFilter)
    : filtered;

  const byDept = groupByDepartment(scoped);

  return JSON.stringify(
    {
      total_products: scoped.length,
      groups: Object.entries(byDept).map(([dept, items]) => ({
        department: dept,
        department_label: DEPARTMENT_LABELS[dept as Department] ?? dept,
        items: items.map((p) => ({
          name: p.name,
          quantity: Number(p.quantity),
          unit: p.unit,
          variants: variantsFor(p),
          brands: brandsFor(p),
          next_expiry: nextExpiryFor(p),
          has_frozen: p.lots.some((l) => l.frozen_at),
          has_opened: p.lots.some((l) => l.opened_at),
        })),
      })),
    },
    null,
    0,
  );
};

// ----------------------------------------------------------------------------
// list_expiring_soon
// ----------------------------------------------------------------------------

const listExpiringSoonDef: ToolDefinition = {
  name: "list_expiring_soon",
  description:
    "Devuelve lotes con stock que vencen dentro de N días (default 7). " +
    "Útil para '¿qué se está por vencer?' o '¿qué puedo cocinar para no " +
    "tirar nada?'.",
  input_schema: {
    type: "object",
    properties: {
      within_days: {
        type: "integer",
        description: "Ventana en días. Default 7.",
      },
    },
  },
};

const listExpiringSoon: ToolHandler = async (input, ctx) => {
  const days =
    typeof input.within_days === "number" && input.within_days > 0
      ? Math.floor(input.within_days)
      : 7;

  const products = await listProducts(ctx.supabase, ctx.householdId);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const horizon = now.getTime() + days * dayMs;

  type Row = {
    product_name: string;
    quantity: number;
    unit: string;
    variant: string | null;
    brand: string | null;
    expires_on: string;
    days_left: number;
    department: string | null;
    /** Estado del lote según los flags: 'frozen' | 'opened' | null (en envase original). */
    state: "frozen" | "opened" | null;
  };
  const rows: Row[] = [];

  for (const p of products) {
    for (const lot of p.lots) {
      const eff = effectiveExpiry(lot);
      if (!eff) continue;
      if (eff.getTime() > horizon) continue;
      if (Number(lot.quantity) <= 0) continue;

      const daysLeft = Math.floor((eff.getTime() - now.getTime()) / dayMs);
      rows.push({
        product_name: p.name,
        quantity: Number(lot.quantity),
        unit: p.unit,
        variant: lot.variant,
        brand: lot.brand,
        expires_on: eff.toISOString().slice(0, 10),
        days_left: daysLeft,
        department: p.department,
        state: lot.frozen_at ? "frozen" : lot.opened_at ? "opened" : null,
      });
    }
  }

  rows.sort((a, b) => a.days_left - b.days_left);
  return JSON.stringify({ within_days: days, count: rows.length, items: rows });
};

// ----------------------------------------------------------------------------
// list_restock
// ----------------------------------------------------------------------------

const listRestockDef: ToolDefinition = {
  name: "list_restock",
  description:
    "Devuelve productos activos sin stock o con stock bajo (≤ umbral). " +
    "Útil para '¿qué me falta?' o sugerir lista de compras.",
  input_schema: {
    type: "object",
    properties: {},
  },
};

const listRestock: ToolHandler = async (_input, ctx) => {
  const products = await listProducts(ctx.supabase, ctx.householdId);
  const result = products
    .filter((p) => p.is_active)
    .map((p) => {
      const qty = Number(p.quantity);
      const threshold = Number(p.low_stock_threshold);
      if (qty <= 0) return { ...basic(p), state: "out" as const };
      if (qty <= threshold)
        return { ...basic(p), state: "low" as const, quantity: qty };
      return null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return JSON.stringify({ count: result.length, items: result });
};

// ----------------------------------------------------------------------------
// list_shopping_list
// ----------------------------------------------------------------------------

const listShoppingListDef: ToolDefinition = {
  name: "list_shopping_list",
  description:
    "Devuelve los items pendientes o marcados de la lista de compras del " +
    "hogar.",
  input_schema: { type: "object", properties: {} },
};

const listShoppingListHandler: ToolHandler = async (_input, ctx) => {
  const items = await listShoppingItems(ctx.supabase, ctx.householdId, [
    "pending",
    "checked",
  ]);
  return JSON.stringify({
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      name: i.product?.name ?? i.custom_name,
      quantity: Number(i.quantity),
      unit: i.unit,
      notes: i.notes,
      state: i.state,
      is_custom: !i.product_id,
    })),
  });
};

// ----------------------------------------------------------------------------
// add_to_shopping_list
// ----------------------------------------------------------------------------

const addToShoppingListDef: ToolDefinition = {
  name: "add_to_shopping_list",
  description:
    "Agrega un producto a la lista de compras del hogar. Buscás el tipo en " +
    "el catálogo por nombre (case-insensitive, substring). Si no encuentra " +
    "match exacto pero hay varios candidatos, devolvé una respuesta de " +
    "ambigüedad para que el usuario confirme. Si el nombre no existe en el " +
    "catálogo, podés crear un 'item suelto' (sin product_id) usando este " +
    "mismo tool con is_custom=true.",
  input_schema: {
    type: "object",
    properties: {
      product_name: {
        type: "string",
        description:
          "Nombre del tipo a agregar. Se busca por substring en el catálogo " +
          "del hogar.",
      },
      quantity: {
        type: "number",
        description: "Cantidad a agregar (default 1).",
      },
      is_custom: {
        type: "boolean",
        description:
          "True para crear un item suelto (no vinculado al catálogo). " +
          "Default false.",
      },
      notes: {
        type: "string",
        description: "Notas opcionales (marca preferida, tamaño, etc.).",
      },
    },
    required: ["product_name"],
  },
};

const addToShoppingList: ToolHandler = async (input, ctx) => {
  const name =
    typeof input.product_name === "string" ? input.product_name.trim() : "";
  if (!name) {
    return JSON.stringify({ ok: false, error: "product_name vacío" });
  }
  const quantity =
    typeof input.quantity === "number" && input.quantity > 0
      ? input.quantity
      : 1;
  const notes =
    typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
  const isCustom = input.is_custom === true;

  // Items custom: insertar directo sin product_id.
  if (isCustom) {
    const { error } = await ctx.supabase.from("shopping_list_items").insert({
      household_id: ctx.householdId,
      product_id: null,
      custom_name: name,
      quantity,
      unit: "un",
      notes,
      source: "manual",
      added_by: ctx.userId,
    });
    if (error) return JSON.stringify({ ok: false, error: error.message });
    return JSON.stringify({ ok: true, added: { name, quantity, custom: true } });
  }

  // Match contra catálogo
  const products = await listProducts(ctx.supabase, ctx.householdId);
  const candidates = products.filter(
    (p) => p.is_active && p.name.toLowerCase().includes(name.toLowerCase()),
  );

  if (candidates.length === 0) {
    return JSON.stringify({
      ok: false,
      error: "no_match",
      message:
        `No encontré "${name}" en el catálogo. Si quieren agregarlo igual ` +
        `como item suelto, llamame de nuevo con is_custom=true.`,
    });
  }

  // Si hay varios y ninguno es exacto, pedimos confirmación.
  if (candidates.length > 1) {
    const exact = candidates.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (!exact) {
      return JSON.stringify({
        ok: false,
        error: "ambiguous",
        message: `Hay varios productos que coinciden con "${name}". Pedile al usuario que aclare.`,
        candidates: candidates.slice(0, 5).map((c) => c.name),
      });
    }
    candidates.splice(0, candidates.length, exact);
  }

  const product = candidates[0];
  try {
    await addOrIncrementForProduct(ctx.supabase, {
      householdId: ctx.householdId,
      productId: product.id,
      quantity,
      unit: product.unit,
      source: "manual",
      userId: ctx.userId,
    });
    return JSON.stringify({
      ok: true,
      added: {
        product_name: product.name,
        quantity,
        unit: product.unit,
      },
    });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
};

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

type Tool = { definition: ToolDefinition; handler: ToolHandler };

const TOOLS: Tool[] = [
  { definition: listInventoryDef, handler: listInventory },
  { definition: listExpiringSoonDef, handler: listExpiringSoon },
  { definition: listRestockDef, handler: listRestock },
  { definition: listShoppingListDef, handler: listShoppingListHandler },
  { definition: addToShoppingListDef, handler: addToShoppingList },
];

export const TOOL_DEFINITIONS = TOOLS.map((t) => t.definition);

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) {
    return JSON.stringify({
      ok: false,
      error: `Tool desconocida: ${name}`,
    });
  }
  try {
    return await tool.handler(input, ctx);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function basic(p: ProductWithLots) {
  return {
    name: p.name,
    department: p.department,
    threshold: Number(p.low_stock_threshold),
    unit: p.unit,
  };
}

function groupByDepartment(
  products: ProductWithLots[],
): Record<string, ProductWithLots[]> {
  const map: Record<string, ProductWithLots[]> = {};
  for (const p of products) {
    const d = isDepartment(p.department) ? p.department : "other";
    if (!map[d]) map[d] = [];
    map[d].push(p);
  }
  return map;
}

function variantsFor(p: ProductWithLots): string[] {
  const set = new Set<string>();
  for (const l of p.lots) {
    if (l.variant) set.add(l.variant);
  }
  return [...set];
}

function brandsFor(p: ProductWithLots): string[] {
  const set = new Set<string>();
  for (const l of p.lots) {
    if (l.brand) set.add(l.brand);
  }
  return [...set];
}

function nextExpiryFor(p: ProductWithLots): string | null {
  let earliest: Date | null = null;
  for (const lot of p.lots) {
    const eff = effectiveExpiry(lot);
    if (!eff) continue;
    if (!earliest || eff.getTime() < earliest.getTime()) earliest = eff;
  }
  return earliest ? earliest.toISOString().slice(0, 10) : null;
}
