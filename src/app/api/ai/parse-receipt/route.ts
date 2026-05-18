/**
 * Endpoint que recibe la imagen de un ticket (base64), la pasa por Sonnet 4.6
 * con vision y devuelve el JSON parseado.
 *
 * Cliente envía:
 *   { imageBase64: string, mediaType: "image/jpeg" | "image/png" | ... }
 *
 * Devuelve:
 *   ParsedReceipt — ver lib/ai/parse-receipt.ts
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/ai/parse-receipt";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tope blando — una imagen bien comprimida no debería superar 1 MB.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type Body = {
  imageBase64?: unknown;
  mediaType?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mediaTypeRaw =
    typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";

  if (!imageBase64) {
    return NextResponse.json(
      { error: "Falta imageBase64." },
      { status: 400 },
    );
  }

  if (!ALLOWED_MEDIA_TYPES.has(mediaTypeRaw)) {
    return NextResponse.json(
      { error: "mediaType no soportado." },
      { status: 400 },
    );
  }

  // Tamaño aproximado: bytes de la imagen ≈ base64.length * 0.75
  const approxBytes = Math.floor(imageBase64.length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `Imagen demasiado grande (${Math.round(approxBytes / 1024)}KB). Reducí la resolución.`,
      },
      { status: 413 },
    );
  }

  try {
    const result = await parseReceipt({
      imageBase64,
      mediaType: mediaTypeRaw as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/parse-receipt]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error inesperado.",
      },
      { status: 500 },
    );
  }
}
