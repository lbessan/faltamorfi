import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestOpenedLifetime } from "@/lib/ai/opened-lifetime";

export const runtime = "nodejs";

type Body = {
  name?: unknown;
  brand?: unknown;
  category?: unknown;
};

export async function POST(request: NextRequest) {
  // Auth: solo usuarios logueados (la clave de Anthropic es nuestra, no del cliente).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Body inválido." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Falta el nombre del producto." },
      { status: 400 },
    );
  }

  try {
    const result = await suggestOpenedLifetime({
      name,
      brand: typeof body.brand === "string" ? body.brand.trim() : null,
      category: typeof body.category === "string" ? body.category.trim() : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai/opened-lifetime]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error inesperado consultando a la IA.",
      },
      { status: 500 },
    );
  }
}
