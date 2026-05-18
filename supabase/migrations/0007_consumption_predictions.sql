-- ============================================================================
-- Falta Morfi — Fase 7 (historial de consumo + predicción de agotamiento)
--
-- Pegá en el SQL Editor y ejecutá. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC: calcula la tasa de consumo (cantidad/día) para cada producto del
--    hogar, mirando una ventana de N días hacia atrás.
--
-- - Considera solo consumos positivos (quantity > 0) — los negativos son
--   devoluciones / ajustes manuales.
-- - daily_rate = total_consumido / days_window
--   (NO se usa "días con eventos" — un user que carga consumo solo los
--    domingos igual debería ver un promedio diario realista).
-- - first_event_at y last_event_at sirven para indicar confianza:
--   un solo evento hace 50 días no se debería tomar como un patrón.
-- ----------------------------------------------------------------------------

create or replace function public.compute_consumption_rates(
  target_household_id uuid,
  days_window int default 60
)
returns table (
  product_id uuid,
  daily_rate numeric,
  total_consumed numeric,
  consumption_events int,
  first_event_at timestamptz,
  last_event_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    cl.product_id,
    (sum(cl.quantity)::numeric / greatest(days_window, 1)) as daily_rate,
    sum(cl.quantity)::numeric as total_consumed,
    count(*)::int as consumption_events,
    min(cl.occurred_at) as first_event_at,
    max(cl.occurred_at) as last_event_at
  from public.consumption_log cl
  join public.products p on p.id = cl.product_id
  where p.household_id = target_household_id
    and cl.occurred_at >= now() - make_interval(days => days_window)
    and cl.quantity > 0
  group by cl.product_id;
$$;

comment on function public.compute_consumption_rates is
  'Tasa de consumo diaria por producto en los últimos N días.';

-- ----------------------------------------------------------------------------
-- 2) RPC: devuelve los últimos N eventos de consumo de un producto (con
--    nombre del usuario y la nota). Para mostrar en el detail sheet.
-- ----------------------------------------------------------------------------

create or replace function public.recent_consumption_for_product(
  target_product_id uuid,
  limit_count int default 20
)
returns table (
  id uuid,
  quantity numeric,
  occurred_at timestamptz,
  note text,
  user_id uuid
)
language sql
stable
security invoker
as $$
  select id, quantity, occurred_at, note, user_id
  from public.consumption_log
  where product_id = target_product_id
  order by occurred_at desc
  limit limit_count;
$$;

comment on function public.recent_consumption_for_product is
  'Últimos N eventos de consumo de un producto, descendente por fecha.';
