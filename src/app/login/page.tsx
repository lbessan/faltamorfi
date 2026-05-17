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
      {/* Blobs decorativos de fondo, sutiles y filtrados */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-brand-sun/20 blur-3xl"
      />

      <Card className="w-full max-w-sm relative backdrop-blur-sm">
        <CardHeader className="items-center text-center pb-2">
          <Image
            src="/logo.png"
            alt="Falta Morfi"
            width={240}
            height={240}
            priority
            className="size-44 drop-shadow-md"
          />
          <CardDescription className="text-base">
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
