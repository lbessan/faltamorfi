-- ============================================================================
-- Falta Morfi — Fase 9 ("abierto en heladera")
--
-- Pegá en el SQL Editor y ejecutá. Idempotente.
--
-- Concepto: muchos productos tienen una vida útil distinta cuando se abren.
-- Mayonesa cerrada dura meses; abierta, 30 días. Una salsa de tomate cerrada
-- aguanta meses; abierta en heladera, 5-7 días.
--
-- Cada stock_item ahora puede marcarse como "abierto" con:
--   - opened_at: cuándo se abrió
--   - opened_max_days: días recomendados desde la apertura
-- El effective_expiry pasa a ser el menor de:
--   1) expires_on (fecha explícita del envase)
--   2) frozen_at + frozen_max_days (si está freezado)
--   3) opened_at + opened_max_days (si está abierto)
-- ============================================================================

alter table public.stock_items
  add column if not exists opened_at       timestamptz,
  add column if not exists opened_max_days int
    check (opened_max_days is null or opened_max_days > 0);

comment on column public.stock_items.opened_at is
  'Cuándo se abrió el lote (envase abierto en heladera).';
comment on column public.stock_items.opened_max_days is
  'Días sugeridos de durabilidad desde la apertura.';
