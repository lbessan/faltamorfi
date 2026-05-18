"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Configuración de una tabla a observar.
 * - `filter`: predicado Supabase Realtime (ej. `"household_id=eq.abc"`).
 *   No todas las tablas tienen un campo apto — para esas usamos undefined
 *   y aceptamos que el evento dispare igual (al refrescar, RLS filtra).
 */
export type RealtimeTable = {
  table: string;
  filter?: string;
};

type Options = {
  tables: RealtimeTable[];
  enabled?: boolean;
  /** Debounce para evitar lluvia de refreshes cuando llegan muchos cambios juntos. */
  debounceMs?: number;
};

/**
 * Suscribe a cambios en una o más tablas de Supabase y dispara
 * `router.refresh()` cuando llegan eventos. El refresh trae la data nueva
 * via las RSC del page, así toda la UI se actualiza sin cliente-side
 * state-syncing.
 *
 * Para uso doméstico el costo es ínfimo; si en el futuro nos importa
 * granularidad, reemplazamos por mutaciones del cache local.
 */
export function useRealtimeRefresh({
  tables,
  enabled = true,
  debounceMs = 300,
}: Options) {
  const router = useRouter();
  // Clave estable para el dependency array del effect.
  const key = tables
    .map((t) => `${t.table}:${t.filter ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => router.refresh(), debounceMs);
    }

    // Un único channel con múltiples bindings — más eficiente que N channels.
    const channel = supabase.channel(`realtime-refresh:${key}`);

    // `.on("postgres_changes", ...)` tiene varios overloads que TS resuelve
    // mal con valores dinámicos. Casteamos a una firma simple para evitar el
    // overload resolution.
    type ChannelOn = (
      event: string,
      filter: object,
      callback: () => void,
    ) => unknown;
    const subscribe = channel.on.bind(channel) as unknown as ChannelOn;

    for (const { table, filter } of tables) {
      subscribe(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs]);
}
