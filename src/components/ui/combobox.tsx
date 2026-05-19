"use client";

/**
 * Combobox: Input con sugerencias filtradas en un dropdown.
 *
 * - El usuario puede tipear libremente (es un input normal).
 * - Mientras tipea, vemos sugerencias coincidentes (substring + acentos
 *   normalizados) en un panel debajo.
 * - Si elige una sugerencia, llamamos `onSelect(option)` y dejamos el texto
 *   pegado a `option.label`.
 * - Si no hay coincidencia, mostramos un placeholder "Crear nuevo" — el padre
 *   maneja el caso (es solo informativo, no es una opción real).
 *
 * Implementación liviana: no usamos cmdk ni popover de Radix. Es un div
 * absoluto debajo del input, controlado por focus + click-outside.
 */

import * as React from "react";
import { ChevronsUpDown, Check, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type ComboboxOption<T = unknown> = {
  value: string;
  label: string;
  /** Substring extra para matchear (e.g. "lácteo" para "Leche"). */
  hint?: string;
  /** Datos arbitrarios que el padre quiera recibir en onSelect. */
  data?: T;
};

type Props<T> = {
  id?: string;
  /** Texto actual del input. */
  value: string;
  onValueChange: (v: string) => void;
  options: ComboboxOption<T>[];
  /** Llamado cuando el usuario elige una sugerencia. */
  onSelect: (option: ComboboxOption<T>) => void;
  placeholder?: string;
  /** Texto a mostrar cuando no hay coincidencias. */
  emptyHint?: string;
  /** Cantidad máxima de resultados en el dropdown. */
  maxResults?: number;
  className?: string;
  /** ID del listbox para a11y. Si no se pasa, se genera uno. */
  listId?: string;
  autoFocus?: boolean;
  required?: boolean;
};

export function Combobox<T = unknown>({
  id,
  value,
  onValueChange,
  options,
  onSelect,
  placeholder,
  emptyHint = "No hay coincidencias — se va a crear como nuevo.",
  maxResults = 8,
  className,
  listId,
  autoFocus,
  required,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const autoListId = React.useId();
  const lbId = listId ?? `combo-${autoListId}`;

  const filtered = React.useMemo(() => {
    const q = normalize(value);
    if (!q) return options.slice(0, maxResults);
    const exact = options.filter((o) => normalize(o.label) === q);
    const starts = options.filter(
      (o) => normalize(o.label).startsWith(q) && !exact.includes(o),
    );
    const contains = options.filter(
      (o) =>
        (normalize(o.label).includes(q) ||
          (o.hint && normalize(o.hint).includes(q))) &&
        !exact.includes(o) &&
        !starts.includes(o),
    );
    return [...exact, ...starts, ...contains].slice(0, maxResults);
  }, [options, value, maxResults]);

  // Click afuera → cerrar.
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Si la lista filtrada cambia, reseteamos el highlight como state derivado
  // (sin useEffect — evita cascading renders).
  const [filteredLen, setFilteredLen] = React.useState(filtered.length);
  if (filtered.length !== filteredLen) {
    setFilteredLen(filtered.length);
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        choose(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function choose(opt: ComboboxOption<T>) {
    onSelect(opt);
    onValueChange(opt.label);
    setOpen(false);
    inputRef.current?.blur();
  }

  const hasMatches = filtered.length > 0;
  const exactMatch = filtered.some(
    (o) => normalize(o.label) === normalize(value),
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          autoFocus={autoFocus}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={lbId}
          aria-activedescendant={
            activeIndex >= 0 ? `${lbId}-opt-${activeIndex}` : undefined
          }
          className="pr-8"
          role="combobox"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle sugerencias"
          onClick={() => {
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <ChevronsUpDown className="size-3.5" />
        </button>
      </div>

      {open && (
        <div
          id={lbId}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {hasMatches ? (
            filtered.map((opt, idx) => (
              <button
                type="button"
                key={opt.value}
                id={`${lbId}-opt-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onClick={() => choose(opt)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors",
                  idx === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                <Search className="size-3.5 text-muted-foreground/70 shrink-0" />
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.hint && (
                  <span className="text-xs text-muted-foreground truncate shrink-0">
                    {opt.hint}
                  </span>
                )}
                {normalize(opt.label) === normalize(value) && (
                  <Check className="size-3.5 text-primary shrink-0" />
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Plus className="size-3.5" />
              {emptyHint}
            </div>
          )}
          {!exactMatch && hasMatches && value.trim() && (
            <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
              <Plus className="size-3.5" />
              Crear nuevo:{" "}
              <span className="text-foreground font-medium">{value.trim()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
