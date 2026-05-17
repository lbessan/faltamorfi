/**
 * Cliente del Open Food Facts API (REST público, sin auth).
 *
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 *
 * Devolvemos `null` cuando el producto no está en su base — el caller puede
 * caer en alta manual con solo el barcode prellenado.
 */

export type OffLookupResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  quantityDescription: string | null; // ej. "1 L" o "500 g"
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

// El UA identifica nuestro cliente — buena práctica con APIs públicas.
const USER_AGENT = "FaltaMorfi/0.1 (https://github.com/lbessan/faltamorfi)";

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<OffLookupResult | null> {
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
    return null; // red caída / abortado
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
  // Preferimos tag en español, fallback a inglés.
  const es = tags.find((t) => t.startsWith("es:"));
  const en = tags.find((t) => t.startsWith("en:"));
  const chosen = es ?? en ?? tags[0];
  return humanizeTag(chosen);
}

function humanizeTag(tag: string): string {
  // "es:productos-lacteos" → "Productos lacteos"
  const withoutPrefix = tag.includes(":") ? tag.split(":").slice(1).join(":") : tag;
  const words = withoutPrefix.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
