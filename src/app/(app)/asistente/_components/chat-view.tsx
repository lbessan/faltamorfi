"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeSuggestionsDialog } from "./recipe-suggestions";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type ApiMessage = {
  role: "user" | "assistant";
  content: unknown;
};

type Props = {
  householdName: string;
};

const SUGGESTIONS = [
  "¿Qué se está por vencer?",
  "¿Qué tengo en el freezer?",
  "¿Qué puedo cocinar con lo que hay?",
  "¿Qué me falta comprar?",
  "Agregale 2 leches a la lista",
];

export function ChatView({ householdName }: Props) {
  // Lo que ve el user. Lo manejamos separado del wire-format que mandamos al API
  // (que incluye tool_use / tool_result blocks).
  const [visible, setVisible] = useState<ChatMessage[]>([]);
  // Historial completo en formato Anthropic (con tool blocks). Es lo que enviamos
  // al server en cada request para preservar contexto.
  const [wire, setWire] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible, pending]);

  const send = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || pending) return;

      setError(null);
      setInput("");

      const newUserMsg: ApiMessage = {
        role: "user",
        content: [{ type: "text", text: userText }],
      };
      const nextVisible = [
        ...visible,
        { role: "user" as const, text: userText },
      ];
      const nextWire = [...wire, newUserMsg];
      setVisible(nextVisible);
      setWire(nextWire);

      setPending(true);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextWire }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          reply: string;
          messages: ApiMessage[];
        };
        setWire(data.messages);
        setVisible([
          ...nextVisible,
          { role: "assistant", text: data.reply || "(sin respuesta)" },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado.");
        // Si falló, no dejamos el user message colgado en wire — quitamos el último
        setWire(wire);
      } finally {
        setPending(false);
      }
    },
    [pending, visible, wire],
  );

  function reset() {
    setVisible([]);
    setWire([]);
    setError(null);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <header className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Asistente
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {householdName}. Pedime info del stock o ayuda con la lista.
          </p>
        </div>
        {visible.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={reset}
            disabled={pending}
            aria-label="Reiniciar conversación"
            className="size-8 shrink-0"
            title="Empezar de nuevo"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </header>

      {/* Quick action: sugerencias de recetas */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => setRecipesOpen(true)}
          className="w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 active:scale-[0.99] transition-all px-3 py-2.5 text-left"
        >
          <span className="inline-flex items-center justify-center size-9 rounded-lg bg-primary/15 text-primary shrink-0">
            <ChefHat className="size-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              ¿Qué cocino hoy?
            </span>
            <span className="block text-xs text-muted-foreground">
              Ideas con lo que tenés, priorizando lo que vence pronto.
            </span>
          </span>
          <Sparkles className="size-4 text-primary shrink-0" />
        </button>
      </div>

      <RecipeSuggestionsDialog
        open={recipesOpen}
        onOpenChange={setRecipesOpen}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {visible.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          visible.map((m, i) => <Bubble key={i} message={m} />)
        )}
        {pending && (
          <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Pensando…
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}
      </div>

      <form
        className="border-t border-border bg-background/95 backdrop-blur px-3 py-2 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Escribí tu pregunta…"
          rows={1}
          disabled={pending}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending || input.trim().length === 0}
          aria-label="Enviar"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="size-7 text-primary" strokeWidth={1.5} />
      </div>
      <div className="max-w-xs">
        <h2 className="font-heading text-base font-semibold">
          ¿Qué necesitás?
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tengo acceso a tu inventario, lista de compras y vencimientos.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full max-w-sm mt-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-sm rounded-lg border border-border bg-card hover:bg-accent/40 px-3 py-2 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
