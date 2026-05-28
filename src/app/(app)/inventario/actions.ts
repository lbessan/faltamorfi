"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import {
  deleteProduct,
  insertProduct,
  updateProduct,
} from "@/lib/db/products";
import { consumeProduct } from "@/lib/db/consumption";
import {
  deleteStockItem,
  insertStockItem,
  updateStockItem,
} from "@/lib/db/stock-items";
import { categorizeProduct } from "@/lib/ai/categorize-product";
import {
  DEPARTMENT_ICONS,
  UNITS,
  isDepartment,
  type Department,
  type Unit,
} from "@/lib/database.types";
import { EMPTY_VALUE_SENTINEL, type ActionState } from "./constants";

const INVENTORY_PATH = "/inventario";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const s = asString(value);
  if (!s) return fallback;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function asNullableString(value: FormDataEntryValue | null): string | null {
  const s = asString(value);
  if (!s || s === EMPTY_VALUE_SENTINEL) return null;
  return s;
}

function normalizeUnit(value: string): Unit {
  return (UNITS as readonly string[]).includes(value) ? (value as Unit) : "un";
}

function describeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return "Ese código de barras ya está en otro lote.";
    }
  }
  return err instanceof Error ? err.message : "Error desconocido.";
}

// ----------------------------------------------------------------------------
// Productos (tipos)
// ----------------------------------------------------------------------------

export async function addProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = asString(formData.get("name"));
  if (!name) return { status: "error", message: "El nombre es obligatorio." };

  try {
    const supabase = await createClient();
    const household = await requireCurrentHousehold(supabase);

    await insertProduct(supabase, {
      household_id: household.id,
      name,
      category: asNullableString(formData.get("category")),
      unit: normalizeUnit(asString(formData.get("unit")) || "un"),
      low_stock_threshold: asNumber(formData.get("low_stock_threshold"), 1),
      notes: asNullableString(formData.get("notes")),
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Producto agregado." };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = asString(formData.get("id"));
  if (!id) return { status: "error", message: "Falta el id del producto." };

  const name = asString(formData.get("name"));
  if (!name) return { status: "error", message: "El nombre es obligatorio." };

  try {
    const supabase = await createClient();

    await updateProduct(supabase, id, {
      name,
      category: asNullableString(formData.get("category")),
      unit: normalizeUnit(asString(formData.get("unit")) || "un"),
      low_stock_threshold: asNumber(formData.get("low_stock_threshold"), 1),
      notes: asNullableString(formData.get("notes")),
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Producto actualizado." };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function deleteProductAction(productId: string): Promise<void> {
  const supabase = await createClient();
  await deleteProduct(supabase, productId);
  revalidatePath(INVENTORY_PATH);
}

export async function setProductActiveAction(
  productId: string,
  active: boolean,
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await updateProduct(supabase, productId, { is_active: active });
    revalidatePath(INVENTORY_PATH);
    revalidatePath("/compras");
    revalidatePath("/hogar");
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

// ----------------------------------------------------------------------------
// Alta combinada: crear producto + primer lote en una sola operación.
// ----------------------------------------------------------------------------

export type CreateProductWithLotInput = {
  product: {
    name: string;
    category: string | null;
    unit: Unit;
    low_stock_threshold: number;
    notes: string | null;
    department?: Department | null;
    icon?: string | null;
  };
  lot: {
    quantity: number;
    expires_on: string | null;
    frozen_at: string | null;
    frozen_max_days: number | null;
    opened_at: string | null;
    opened_max_days: number | null;
    brand: string | null;
    variant: string | null;
    barcode: string | null;
    image_url: string | null;
    notes: string | null;
  };
};

export async function createProductWithLotAction(
  input: CreateProductWithLotInput,
): Promise<ActionState> {
  if (!input.product.name.trim()) {
    return { status: "error", message: "El nombre es obligatorio." };
  }
  if (!Number.isFinite(input.lot.quantity) || input.lot.quantity <= 0) {
    return { status: "error", message: "La cantidad debe ser mayor a 0." };
  }

  try {
    const supabase = await createClient();
    const household = await requireCurrentHousehold(supabase);

    // Si no llegó department/icon, le pedimos a Claude que categorice.
    let department: Department | null = isDepartment(input.product.department)
      ? input.product.department
      : null;
    let icon: string | null = input.product.icon ?? null;

    if (!department || !icon) {
      const ai = await categorizeProduct({
        name: input.product.name,
        brand: input.lot.brand,
      });
      department = department ?? ai.department;
      icon = icon ?? ai.icon;
    }

    const product = await insertProduct(supabase, {
      household_id: household.id,
      name: input.product.name,
      category: input.product.category,
      unit: normalizeUnit(input.product.unit),
      low_stock_threshold: input.product.low_stock_threshold,
      notes: input.product.notes,
      department,
      icon: icon ?? DEPARTMENT_ICONS[department],
    });

    await insertStockItem(supabase, {
      product_id: product.id,
      quantity: input.lot.quantity,
      expires_on: input.lot.expires_on,
      frozen_at: input.lot.frozen_at,
      frozen_max_days: input.lot.frozen_max_days,
      opened_at: input.lot.opened_at,
      opened_max_days: input.lot.opened_max_days,
      brand: input.lot.brand,
      variant: input.lot.variant,
      barcode: input.lot.barcode,
      image_url: input.lot.image_url,
      notes: input.lot.notes,
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Producto creado." };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

// ----------------------------------------------------------------------------

export async function consumeProductAction(
  productId: string,
  quantity: number,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await consumeProduct(supabase, {
    productId,
    quantity,
    userId: user?.id ?? null,
  });

  revalidatePath(INVENTORY_PATH);
}

// ----------------------------------------------------------------------------
// Lotes (stock_items)
// ----------------------------------------------------------------------------

export type LotInput = {
  product_id: string;
  quantity: number;
  expires_on?: string | null;
  frozen_at?: string | null;
  frozen_max_days?: number | null;
  opened_at?: string | null;
  opened_max_days?: number | null;
  brand?: string | null;
  variant?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  notes?: string | null;
};

export async function addLotAction(input: LotInput): Promise<ActionState> {
  try {
    if (!input.product_id) {
      return { status: "error", message: "Falta el id del producto." };
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      return { status: "error", message: "La cantidad debe ser mayor a 0." };
    }

    const supabase = await createClient();
    await insertStockItem(supabase, {
      product_id: input.product_id,
      quantity: input.quantity,
      expires_on: input.expires_on ?? null,
      frozen_at: input.frozen_at ?? null,
      frozen_max_days: input.frozen_max_days ?? null,
      opened_at: input.opened_at ?? null,
      opened_max_days: input.opened_max_days ?? null,
      brand: input.brand ?? null,
      variant: input.variant ?? null,
      barcode: input.barcode ?? null,
      image_url: input.image_url ?? null,
      notes: input.notes ?? null,
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Lote agregado." };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function updateLotAction(
  lotId: string,
  patch: Partial<Omit<LotInput, "product_id">>,
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await updateStockItem(supabase, lotId, {
      quantity: patch.quantity,
      expires_on: patch.expires_on,
      frozen_at: patch.frozen_at,
      frozen_max_days: patch.frozen_max_days,
      opened_at: patch.opened_at,
      opened_max_days: patch.opened_max_days,
      brand: patch.brand,
      variant: patch.variant,
      barcode: patch.barcode,
      image_url: patch.image_url,
      notes: patch.notes,
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function deleteLotAction(lotId: string): Promise<void> {
  const supabase = await createClient();
  await deleteStockItem(supabase, lotId);
  revalidatePath(INVENTORY_PATH);
}

/**
 * Descuenta `amount` de un lote específico (no FIFO). Si la cantidad llega a 0
 * eliminamos el lote. Registramos el consumo en el log para no romper
 * predicciones.
 */
export async function consumeLotAction(
  lotId: string,
  amount: number,
): Promise<ActionState> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Cantidad inválida." };
  }
  try {
    const supabase = await createClient();
    const { data: lot, error: readError } = await supabase
      .from("stock_items")
      .select("id, product_id, quantity")
      .eq("id", lotId)
      .single();
    if (readError) throw readError;
    if (!lot) return { status: "error", message: "Lote no encontrado." };

    const current = Number(lot.quantity);
    const actualConsumed = Math.min(current, amount);
    if (actualConsumed <= 0) {
      return { status: "error", message: "El lote ya está vacío." };
    }
    const next = current - actualConsumed;

    if (next <= 0) {
      await deleteStockItem(supabase, lotId);
    } else {
      await updateStockItem(supabase, lotId, { quantity: next });
    }

    // Loguear consumo para mantener predicciones.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("consumption_log").insert({
      product_id: lot.product_id,
      quantity: actualConsumed,
      user_id: user?.id ?? null,
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}
