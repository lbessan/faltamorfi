import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between px-4 py-3">
          <Link href="/inventario" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Falta Morfi"
              width={40}
              height={40}
              priority
              className="size-9"
            />
            <span className="sr-only">Falta Morfi</span>
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full pb-24">{children}</main>

      <BottomNav />
    </div>
  );
}
