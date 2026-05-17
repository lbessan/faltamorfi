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
import { UNITS, type Unit } from "@/lib/database.types";
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

/**
 * Convierte errores conocidos de Postgres en mensajes legibles en español.
 * Trabaja con el shape de error de Supabase (PostgrestError tiene `code`).
 */
function describeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return "Ya tenés otro producto con ese mismo código de barras.";
    }
  }
  return err instanceof Error ? err.message : "Error desconocido.";
}

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
      brand: asNullableString(formData.get("brand")),
      category: asNullableString(formData.get("category")),
      unit: normalizeUnit(asString(formData.get("unit")) || "un"),
      quantity: asNumber(formData.get("quantity"), 0),
      low_stock_threshold: asNumber(formData.get("low_stock_threshold"), 1),
      default_location_id: asNullableString(formData.get("default_location_id")),
      barcode: asNullableString(formData.get("barcode")),
      notes: asNullableString(formData.get("notes")),
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Producto agregado." };
  } catch (err) {
    return {
      status: "error",
      message: describeError(err),
    };
  }
}

// ----------------------------------------------------------------------------

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
      brand: asNullableString(formData.get("brand")),
      category: asNullableString(formData.get("category")),
      unit: normalizeUnit(asString(formData.get("unit")) || "un"),
      quantity: asNumber(formData.get("quantity"), 0),
      low_stock_threshold: asNumber(formData.get("low_stock_threshold"), 1),
      default_location_id: asNullableString(formData.get("default_location_id")),
      barcode: asNullableString(formData.get("barcode")),
      notes: asNullableString(formData.get("notes")),
    });

    revalidatePath(INVENTORY_PATH);
    return { status: "success", message: "Producto actualizado." };
  } catch (err) {
    return {
      status: "error",
      message: describeError(err),
    };
  }
}

// ----------------------------------------------------------------------------

export async function deleteProductAction(productId: string): Promise<void> {
  const supabase = await createClient();
  await deleteProduct(supabase, productId);
  revalidatePath(INVENTORY_PATH);
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

