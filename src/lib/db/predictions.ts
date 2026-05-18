import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Ventana por defecto para calcular tasa de consumo.
 * 60 días captura patrones semanales y mensuales sin diluir tendencias
 * recientes.
 */
export const DEFAULT_PREDICTION_WINDOW = 60;

export type ConsumptionRate = {
  product_id: string;
  daily_rate: number;
  total_consumed: number;
  consumption_events: number;
  first_event_at: string;
  last_event_at: string;
};

/**
 * Confianza en la predicción según cantidad de eventos en la ventana.
 *  - none:   menos de 2 eventos → no podemos extrapolar.
 *  - low:    2–4 eventos.
 *  - medium: 5–9 eventos.
 *  - high:   10+ eventos.
 */
export type Confidence = "none" | "low" | "medium" | "high";

export type Prediction = {
  /** Cantidad/día estimada. 0 si no hay datos. */
  dailyRate: number;
  /**
   * Días restantes estimados a la fecha (stock_actual / daily_rate).
   * null si daily_rate es 0 (no se consume) o no hay datos suficientes.
   */
  daysLeft: number | null;
  confidence: Confidence;
  /** Cantidad total consumida en la ventana. */
  totalConsumed: number;
  /** Cantidad de eventos en la ventana. */
  events: number;
};

export type RecentConsumption = {
  id: string;
  quantity: number;
  occurred_at: string;
  note: string | null;
  user_id: string | null;
};

// ----------------------------------------------------------------------------

/**
 * Devuelve un Map<product_id, ConsumptionRate> para todos los productos del
 * hogar que tuvieron al menos un consumo en la ventana.
 * Los productos sin consumo registrado no aparecen en el Map.
 */
export async function fetchConsumptionRates(
  supabase: SupabaseClient<Database>,
  householdId: string,
  daysWindow: number = DEFAULT_PREDICTION_WINDOW,
): Promise<Map<string, ConsumptionRate>> {
  const { data, error } = await supabase.rpc("compute_consumption_rates", {
    target_household_id: householdId,
    days_window: daysWindow,
  });
  if (error) throw error;

  const map = new Map<string, ConsumptionRate>();
  for (const row of data ?? []) {
    map.set(row.product_id, row as ConsumptionRate);
  }
  return map;
}

export async function fetchRecentConsumption(
  supabase: SupabaseClient<Database>,
  productId: string,
  limit: number = 20,
): Promise<RecentConsumption[]> {
  const { data, error } = await supabase.rpc(
    "recent_consumption_for_product",
    { target_product_id: productId, limit_count: limit },
  );
  if (error) throw error;
  return (data ?? []) as RecentConsumption[];
}

// ----------------------------------------------------------------------------

/**
 * Calcula la predicción para un producto a partir de su rate (puede ser null
 * si no hay datos) y su stock actual.
 */
export function predictDaysLeft(
  rate: ConsumptionRate | undefined,
  currentQuantity: number,
): Prediction {
  if (!rate || rate.consumption_events < 2 || rate.daily_rate <= 0) {
    return {
      dailyRate: rate?.daily_rate ?? 0,
      daysLeft: null,
      confidence: confidenceFromEvents(rate?.consumption_events ?? 0),
      totalConsumed: rate?.total_consumed ?? 0,
      events: rate?.consumption_events ?? 0,
    };
  }

  const daysLeft = currentQuantity / rate.daily_rate;
  return {
    dailyRate: rate.daily_rate,
    daysLeft: Number.isFinite(daysLeft) ? daysLeft : null,
    confidence: confidenceFromEvents(rate.consumption_events),
    totalConsumed: rate.total_consumed,
    events: rate.consumption_events,
  };
}

function confidenceFromEvents(events: number): Confidence {
  if (events < 2) return "none";
  if (events < 5) return "low";
  if (events < 10) return "medium";
  return "high";
}

// ----------------------------------------------------------------------------

/**
 * Formatea la tasa diaria en una unidad legible:
 *   ≥ 1/día   → "X / día"
 *   ≥ 0.15/día → "X / semana" (1+ por semana)
 *   sino       → "X / mes"
 */
export function formatDailyRate(rate: number, unit: string): string {
  if (rate <= 0) return "Sin consumo";
  if (rate >= 1) {
    return `${formatNumber(rate)} ${unit}/día`;
  }
  if (rate >= 1 / 7) {
    return `${formatNumber(rate * 7)} ${unit}/sem`;
  }
  return `${formatNumber(rate * 30)} ${unit}/mes`;
}

export function formatDaysLeft(daysLeft: number): string {
  const rounded = Math.round(daysLeft);
  if (rounded <= 0) return "Se está por acabar";
  if (rounded === 1) return "Te queda ~1 día";
  if (rounded <= 7) return `Te quedan ~${rounded} días`;
  if (rounded <= 30) {
    const weeks = Math.round(rounded / 7);
    return `Te queda${weeks === 1 ? "" : "n"} ~${weeks} semana${weeks === 1 ? "" : "s"}`;
  }
  const months = Math.round(rounded / 30);
  return `Te queda${months === 1 ? "" : "n"} ~${months} mes${months === 1 ? "" : "es"}`;
}

function formatNumber(n: number): string {
  if (n >= 10) return Math.round(n).toString();
  if (n >= 1) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/\.?0+$/, "");
}
