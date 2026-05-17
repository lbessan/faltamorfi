import Image from "next/image";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Falta Morfi"
              width={40}
              height={40}
              priority
              className="size-10"
            />
            <span className="sr-only">Falta Morfi</span>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bienvenido</h1>
          <p className="text-muted-foreground text-sm">
            Sesión activa como{" "}
            <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fase 0 completa</CardTitle>
            <CardDescription>
              Auth, PWA, Supabase y UI base están funcionando. Próxima parada:
              modelo de datos y CRUD de inventario.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Siguiente fase:</strong> alta
              manual de productos, ubicaciones y descuento de stock.
            </p>
            <p>
              <strong className="text-foreground">Después:</strong> escaneo de
              códigos de barra + Open Food Facts.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
