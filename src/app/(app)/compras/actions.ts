"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import {
  addOrIncrementForProduct,
  closeShoppingTrip,
  deleteShoppingItem,
  insertShoppingItem,
  updateShoppingItem,
} from "@/lib/db/shopping";
import type { ActionState } from "../inventario/constants";

const COMPRAS_PATH = "/compras";
const INVENTARIO_PATH = "/inventario";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido.";
}

// ----------------------------------------------------------------------------
// Agregar a la lista
// ----------------------------------------------------------------------------

export async function addProductToListAction(
  productId: string,
  quantity: number = 1,
  source: "restock" | "low_stock" | "manual" = "manual",
): Promise<ActionState> {
  if (!productId) {
    return { status: "error", message: "Falta el producto." };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { status: "error", message: "Cantidad inválida." };
  }
  try {
    const supabase = await createClient();
    const household = await requireCurrentHousehold(supabase);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Tomamos la unidad del producto si existe.
    const { data: product } = await supabase
      .from("products")
      .select("unit")
      .eq("id", productId)
      .single();

    await addOrIncrementForProduct(supabase, {
      householdId: household.id,
      productId,
      quantity,
      unit: product?.unit ?? "un",
      source,
      userId: user?.id ?? null,
    });

    revalidatePath(COMPRAS_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function addCustomItemAction(input: {
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
}): Promise<ActionState> {
  const name = input.name.trim();
  if (!name) {
    return { status: "error", message: "Poné un nombre para el item." };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { status: "error", message: "Cantidad inválida." };
  }
  try {
    const supabase = await createClient();
    const household = await requireCurrentHousehold(supabase);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await insertShoppingItem(supabase, {
      household_id: household.id,
      product_id: null,
      custom_name: name,
      quantity: input.quantity,
      unit: input.unit || "un",
      notes: input.notes,
      source: "manual",
      added_by: user?.id ?? null,
    });

    revalidatePath(COMPRAS_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

// ----------------------------------------------------------------------------
// Editar / quitar
// ----------------------------------------------------------------------------

export async function updateListItemAction(
  itemId: string,
  patch: {
    quantity?: number;
    unit?: string;
    notes?: string | null;
    custom_name?: string | null;
  },
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await updateShoppingItem(supabase, itemId, patch);
    revalidatePath(COMPRAS_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

export async function removeListItemAction(itemId: string): Promise<void> {
  const supabase = await createClient();
  await deleteShoppingItem(supabase, itemId);
  revalidatePath(COMPRAS_PATH);
}

// ----------------------------------------------------------------------------
// Check / uncheck
// ----------------------------------------------------------------------------

export async function setItemStateAction(
  itemId: string,
  state: "pending" | "checked",
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await updateShoppingItem(supabase, itemId, {
      state,
      checked_at: state === "checked" ? new Date().toISOString() : null,
    });
    revalidatePath(COMPRAS_PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}

// ----------------------------------------------------------------------------
// Cerrar viaje
// ----------------------------------------------------------------------------

export async function closeTripAction(): Promise<
  ActionState & { processed?: number }
> {
  try {
    const supabase = await createClient();
    const household = await requireCurrentHousehold(supabase);
    const processed = await closeShoppingTrip(supabase, household.id);
    revalidatePath(COMPRAS_PATH);
    revalidatePath(INVENTARIO_PATH);
    return {
      status: "success",
      message:
        processed === 0
          ? "No había nada marcado."
          : `${processed} item${processed === 1 ? "" : "s"} cargado${processed === 1 ? "" : "s"} al inventario.`,
      processed,
    };
  } catch (err) {
    return { status: "error", message: describeError(err) };
  }
}
