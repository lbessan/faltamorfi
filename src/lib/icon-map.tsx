/**
 * Resuelve nombres de iconos (string del catálogo) a componentes Lucide.
 * Si un nombre no existe en la versión instalada de `lucide-react`, devuelve
 * `Package` como fallback — la UI nunca tira por un icono mal escrito.
 */

import { createElement } from "react";
import * as LucideIcons from "lucide-react";
import { Package, type LucideIcon } from "lucide-react";

const ICONS = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

// Aliases para nombres descriptivos del catálogo que no tienen un icono propio
// en Lucide. Los mapeamos al icono más cercano.
const ALIASES: Record<string, string> = {
  Butter: "Cookie",
  Ham: "Beef",
  Bean: "CircleDot",
};

export function resolveIcon(name?: string | null): LucideIcon {
  if (!name) return Package;
  const aliased = ALIASES[name] ?? name;
  return ICONS[aliased] ?? Package;
}

/**
 * Renderiza un icono Lucide por nombre. Usa `createElement` (en lugar de JSX
 * con la variable como tag) para evitar el warning de
 * `react-hooks/static-components` — el componente NO se crea en cada render,
 * se resuelve de un mapa estático.
 */
export function DynamicIcon({
  name,
  className,
  strokeWidth,
}: {
  name?: string | null;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(resolveIcon(name), { className, strokeWidth });
}
