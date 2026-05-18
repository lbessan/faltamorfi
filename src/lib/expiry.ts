/**
 * Cálculo unificado del "vencimiento efectivo" de un lote.
 *
 * Un mismo lote puede tener tres relojes corriendo en paralelo:
 *
 *   1. **Fecha del envase** (`expires_on`): impresa en el producto.
 *   2. **Freezer**: si está congelado, dura `frozen_max_days` desde
 *      `frozen_at`.
 *   3. **Abierto en heladera**: si está abierto, dura `opened_max_days`
 *      desde `opened_at`.
 *
 * El que vence primero gana — eso es lo que mostramos como urgencia real.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryFields = {
  expires_on: string | null;
  frozen_at: string | null;
  frozen_max_days: number | null;
  opened_at: string | null;
  opened_max_days: number | null;
};

/**
 * Devuelve la fecha más cercana entre las tres fuentes posibles, o null si
 * ninguna aplica.
 */
export function effectiveExpiry(lot: ExpiryFields): Date | null {
  const candidates: Date[] = [];

  if (lot.expires_on) {
    candidates.push(new Date(`${lot.expires_on}T00:00:00`));
  }

  if (lot.frozen_at && lot.frozen_max_days) {
    candidates.push(
      new Date(new Date(lot.frozen_at).getTime() + lot.frozen_max_days * DAY_MS),
    );
  }

  if (lot.opened_at && lot.opened_max_days) {
    candidates.push(
      new Date(new Date(lot.opened_at).getTime() + lot.opened_max_days * DAY_MS),
    );
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((min, d) => (d < min ? d : min), candidates[0]);
}

/**
 * Cantidad de días entre hoy (00:00) y la fecha objetivo. Negativo si ya pasó.
 */
export function daysUntil(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - now.getTime()) / DAY_MS);
}
