"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Package, ShoppingBasket, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (path: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/inventario",
    label: "Inventario",
    icon: Package,
    match: (path) => path === "/" || path.startsWith("/inventario"),
  },
  {
    href: "/compras",
    label: "Compras",
    icon: ShoppingBasket,
    match: (path) => path.startsWith("/compras"),
  },
  {
    href: "/asistente",
    label: "Asistente",
    icon: Sparkles,
    match: (path) => path.startsWith("/asistente"),
  },
  {
    href: "/hogar",
    label: "Hogar",
    icon: Home,
    match: (path) => path.startsWith("/hogar"),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur-md z-20 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul className="max-w-3xl mx-auto w-full grid grid-cols-4 px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all duration-200",
                    active
                      ? "h-10 px-7 bg-primary text-primary-foreground shadow-brand"
                      : "h-10 px-5",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-6 transition-all",
                      active && "stroke-[2.5]",
                    )}
                  />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
