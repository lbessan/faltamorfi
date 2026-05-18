/**
 * Lookup combinado: Open Food Facts + normalización con Claude.
 *
 * 1. Recibe ?barcode=.
 * 2. Hace fetch a OFF (server-side, sin exponer la API key de Claude al
 *    cliente).
 * 3. Si hay datos, los pasa por Claude Haiku para normalizar nombre/marca
 *    y sugerir el tipo genérico del catálogo.
 * 4. Devuelve el OffLookupResult al cliente.
 *
 * Cae a los datos crudos si la normalización falla (sin clave, error de red).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupBarcodeViaOFF, type OffLookupResult } from "@/lib/openfoodfacts";
import { normalizeProductName } from "@/lib/ai/normalize-product-name";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const barcode = request.nextUrl.searchParams.get("barcode") ?? "";
  if (!barcode.trim()) {
    return NextResponse.json(
      { error: "Falta ?barcode." },
      { status: 400 },
    );
  }

  let raw;
  try {
    raw = await lookupBarcodeViaOFF(barcode);
  } catch (err) {
    console.error("[api/off/lookup] OFF fetch failed", err);
    raw = null;
  }

  if (!raw) {
    return NextResponse.json({ error: "no_match" }, { status: 404 });
  }

  // Intento de normalización IA — opcional, mejor esfuerzo.
  let normalized:
    | Awaited<ReturnType<typeof normalizeProductName>>
    | null = null;
  try {
    normalized = await normalizeProductName({
      rawName: raw.name,
      rawBrand: raw.brand,
      category: raw.category,
      quantityDescription: raw.quantityDescription,
    });
  } catch (err) {
    console.error("[api/off/lookup] normalize failed", err);
    normalized = null;
  }

  const result: OffLookupResult = {
    barcode: raw.barcode,
    name: normalized?.name ?? raw.name,
    brand: normalized?.brand ? normalized.brand : raw.brand,
    category: raw.category,
    imageUrl: raw.imageUrl,
    quantityDescription: raw.quantityDescription,
    suggestedType: normalized?.suggestedType
      ? normalized.suggestedType
      : null,
    normalized: normalized !== null,
  };

  return NextResponse.json(result);
}
