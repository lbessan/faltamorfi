"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, Package } from "lucide-react";
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
    href: "/lista",
    label: "Lista",
    icon: ListChecks,
    match: (path) => path.startsWith("/lista"),
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
      className="fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur z-20"
      aria-label="Navegación principal"
    >
      <ul className="max-w-3xl mx-auto w-full grid grid-cols-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5]")} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
