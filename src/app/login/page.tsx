import type { Metadata } from "next";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") ? params.next : undefined;

  return (
    <main className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
      {/* Tres blobs vibrantes inspirados en el logo: turquesa, amarillo, coral */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-20 size-80 rounded-full bg-primary/40 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 -right-32 size-96 rounded-full bg-brand-sun/40 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-brand-fire/30 blur-[100px]"
      />

      <Card className="w-full max-w-sm relative backdrop-blur-md bg-card/95">
        <CardHeader className="items-center text-center pb-2">
          <Image
            src="/logo.png"
            alt="Falta Morfi"
            width={240}
            height={240}
            priority
            className="size-44 drop-shadow-lg"
          />
          <CardDescription className="text-base font-medium text-foreground/90">
            Tu despensa, siempre al día.
          </CardDescription>
          <p className="text-xs text-muted-foreground pt-1">
            Entrá con Google o pedí un link mágico por email.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
