/**
 * Cliente del Open Food Facts API + capa de normalización con Claude.
 *
 * Hay dos funciones:
 *
 * 1. `lookupBarcodeViaOFF` — server-only. Hace el fetch directo a OFF y
 *    devuelve el resultado crudo (sin pasar por Claude).
 *
 * 2. `lookupBarcode` — para usar desde el cliente. Llama a nuestro endpoint
 *    `/api/off/lookup`, que internamente hace (1) + normalización con IA.
 *    Devuelve el mismo shape pero con `name`, `brand` y nuevo `suggestedType`
 *    normalizados.
 *
 * Docs OFF: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */

export type OffLookupResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  quantityDescription: string | null;
  /** Tipo genérico sugerido por la IA (ej. "Leche entera"). null si no se pudo. */
  suggestedType: string | null;
  /** True si los campos name/brand pasaron por normalización IA. */
  normalized: boolean;
};

const FIELDS = [
  "product_name",
  "product_name_es",
  "product_name_en",
  "brands",
  "categories_tags",
  "image_front_url",
  "image_url",
  "quantity",
].join(",");

const USER_AGENT = "FaltaMorfi/0.1 (https://github.com/lbessan/faltamorfi)";

// ----------------------------------------------------------------------------
// SERVER-ONLY: fetch directo a OFF, sin normalización
// ----------------------------------------------------------------------------

export type OffRawResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  quantityDescription: string | null;
};

export async function lookupBarcodeViaOFF(
  barcode: string,
  signal?: AbortSignal,
): Promise<OffRawResult | null> {
  const clean = barcode.replace(/\s+/g, "");
  if (!/^\d{6,14}$/.test(clean)) return null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    clean,
  )}.json?fields=${FIELDS}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal,
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  type OffResponse = {
    status: number;
    product?: {
      product_name?: string;
      product_name_es?: string;
      product_name_en?: string;
      brands?: string;
      categories_tags?: string[];
      image_front_url?: string;
      image_url?: string;
      quantity?: string;
    };
  };

  const data = (await res.json()) as OffResponse;
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  return {
    barcode: clean,
    name: pickName(p),
    brand: pickFirstBrand(p.brands),
    category: pickCategory(p.categories_tags),
    imageUrl: p.image_front_url ?? p.image_url ?? null,
    quantityDescription: p.quantity?.trim() || null,
  };
}

// ----------------------------------------------------------------------------
// CLIENTE: llama al endpoint /api/off/lookup (que aplica normalización)
// ----------------------------------------------------------------------------

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<OffLookupResult | null> {
  const clean = barcode.replace(/\s+/g, "");
  if (!/^\d{6,14}$/.test(clean)) return null;

  let res: Response;
  try {
    res = await fetch(`/api/off/lookup?barcode=${encodeURIComponent(clean)}`, {
      signal,
    });
  } catch {
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  try {
    return (await res.json()) as OffLookupResult;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function pickName(p: {
  product_name?: string;
  product_name_es?: string;
  product_name_en?: string;
}): string | null {
  const candidates = [p.product_name_es, p.product_name, p.product_name_en];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function pickFirstBrand(brands?: string): string | null {
  if (!brands) return null;
  const first = brands.split(",")[0]?.trim();
  return first || null;
}

function pickCategory(tags?: string[]): string | null {
  if (!tags?.length) return null;
  const es = tags.find((t) => t.startsWith("es:"));
  const en = tags.find((t) => t.startsWith("en:"));
  const chosen = es ?? en ?? tags[0];
  return humanizeTag(chosen);
}

function humanizeTag(tag: string): string {
  const withoutPrefix = tag.includes(":")
    ? tag.split(":").slice(1).join(":")
    : tag;
  const words = withoutPrefix.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
