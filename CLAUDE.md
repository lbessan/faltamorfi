@AGENTS.md

## Migraciones de Supabase

- Viven en `supabase/`: `schema.sql` es la base y `migrations/NNNN_*.sql` sigue en orden. Se aplican a mano, pegándolas en el SQL Editor de Supabase.
- Desde el 2026-10-30, toda tabla o vista nueva de `public` lleva sus grants en su migración (`authenticated`, `service_role`; `anon` sólo si se lee sin sesión, hoy ninguna), además de su RLS: Supabase ya no los da solos. `npm run check-grants` lo frena; como no hay CI ni hook, correlo antes de commitear una migración. Una secuencia nueva (`serial`) lleva además `grant usage, select on sequence` (la guardia no lo mira); una columna `generated ... as identity` no pide nada.
