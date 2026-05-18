"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Home, Package, ShoppingBasket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border bg-sidebar sticky top-0 h-screen"
      aria-label="Navegación principal"
    >
      <div className="px-5 py-5 border-b border-border">
        <Link
          href="/inventario"
          className="flex items-center gap-2.5 group"
          aria-label="Falta Morfi - Inventario"
        >
          <span className="inline-flex items-center justify-center size-10 rounded-2xl bg-primary/15 ring-1 ring-primary/20 transition-transform group-active:scale-95">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-9"
            />
          </span>
          <span className="font-heading font-semibold text-lg tracking-tight">
            Falta Morfi
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-semibold shadow-brand"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0",
                      active && "stroke-[2.5]",
                    )}
                  />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <form action="/auth/signout" method="post">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <LogOut className="size-4" />
            Salir
          </Button>
        </form>
      </div>
    </aside>
  );
}
