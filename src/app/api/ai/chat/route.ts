/**
 * Endpoint del asistente conversacional.
 *
 * Flujo:
 * 1. Recibe el historial de mensajes del cliente.
 * 2. Corre un agentic loop server-side: cada vuelta consulta a Claude y, si
 *    devuelve tool_use, ejecuta el handler (ver tools.ts) y vuelve a llamar.
 * 3. Termina cuando Claude dice end_turn o llegamos al cap de iteraciones.
 * 4. Devuelve los mensajes nuevos al cliente, que los appendea a su state.
 *
 * Usamos `messages.stream().finalMessage()` por iteración para evitar
 * timeouts del SDK con respuestas largas.
 */

import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from "./tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";
const MAX_ITERATIONS = 5;
const MAX_TOKENS = 2048;

type ChatBody = {
  messages: unknown;
};

export async function POST(request: NextRequest) {
  // Auth + household
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Faltan mensajes." },
      { status: 400 },
    );
  }
  const userMessages = body.messages as MessageParam[];

  const household = await requireCurrentHousehold(supabase);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta ANTHROPIC_API_KEY en el entorno." },
      { status: 500 },
    );
  }
  const client = new Anthropic({ apiKey });

  const ctx: ToolContext = {
    supabase,
    householdId: household.id,
    userId: user.id,
  };

  const systemPrompt = buildSystemPrompt(household.name);

  // Working copy of the conversation. Mutamos appendeando turns nuevos.
  const messages: MessageParam[] = [...userMessages];
  let iteration = 0;
  let finalText = "";

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages,
      });
      const response = await stream.finalMessage();

      // Append assistant turn al historial (incluye text + tool_use blocks)
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        finalText = extractText(response.content);
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter(
          (b): b is ToolUseBlock => b.type === "tool_use",
        );

        const toolResults = await Promise.all(
          toolUses.map(async (tu) => ({
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: await executeTool(
              tu.name,
              tu.input as Record<string, unknown>,
              ctx,
            ),
          })),
        );

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      if (response.stop_reason === "max_tokens") {
        finalText = extractText(response.content) || "(respuesta cortada por longitud)";
        break;
      }

      // pause_turn u otros: cortamos
      finalText = extractText(response.content);
      break;
    }

    if (iteration >= MAX_ITERATIONS && !finalText) {
      finalText =
        "Me trabé pensando — probá reformular la consulta o pedime algo más concreto.";
    }

    return NextResponse.json({
      reply: finalText,
      // Devolvemos el thread completo para que el cliente lo persista; incluye
      // los turns de tool_use/tool_result. El cliente puede usarlos en la
      // próxima request para mantener contexto.
      messages,
    });
  } catch (err) {
    console.error("[api/ai/chat]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error inesperado.",
      },
      { status: 500 },
    );
  }
}

// ----------------------------------------------------------------------------

function buildSystemPrompt(householdName: string): string {
  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `Sos el asistente de **Falta Morfi**, una app para gestionar el stock doméstico de productos.

Estás conversando con un miembro del hogar "${householdName}". Hoy es ${today}.

# Cómo te comportás

- Hablás en español rioplatense (vos, podés, querés, etc.). Tono natural, directo, sin formalismos.
- Sos conciso por default. Si la respuesta es lista, usá viñetas o tabla simple. Si es corta, una sola frase alcanza.
- NUNCA inventés productos o cantidades. Si necesitás datos del inventario, usá las tools.
- Cuando uses tools y el resultado no tenga datos relevantes, decilo claro ("No tenés stock de eso").
- No anuncies que vas a usar una tool ("voy a chequear..."). Llamala directo y respondé con el resultado.
- Si el usuario pide agregar algo a la lista de compras, hacelo con add_to_shopping_list y confirmá con una frase corta.
- Para recetas, usá tu conocimiento general pero **primero** consultá list_inventory para ver con qué cuenta el usuario. Sugerí 2-3 opciones máximo, con un bullet por ingrediente que sí tiene.

# Tools disponibles

- list_inventory: stock actual + vencimientos. Filtrable por departamento.
- list_expiring_soon: vencimientos próximos.
- list_restock: sin stock o stock bajo (qué reponer).
- list_shopping_list: items en la lista de compras.
- add_to_shopping_list: agregar items a la lista.

# Cosas que NO podés hacer (aún)

- Cargar lotes nuevos al inventario (decile al usuario que use el botón + en el Inventario).
- Editar o eliminar productos.
- Configurar notificaciones, hogares, miembros.

# Ejemplos de respuesta

Usuario: "¿Qué tengo de lácteos?"
→ Llamás list_inventory con department="dairy", respondés con una lista corta.

Usuario: "¿Qué se vence esta semana?"
→ list_expiring_soon con within_days=7, listás cada item con cuántos días le quedan.

Usuario: "Agregale 2 leches a la lista"
→ add_to_shopping_list con product_name="leche" y quantity=2. Confirmás: "Listo, 2 leches a la lista 👍" (sin emojis si el usuario no los usó).

Usuario: "¿Qué puedo cocinar?"
→ list_inventory (todo), elegís 2-3 recetas posibles según ingredientes reales, con un bullet por receta y los ingredientes que tiene en negrita.`;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}
