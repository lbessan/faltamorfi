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

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/logo.png"
            alt="Falta Morfi"
            width={200}
            height={200}
            priority
            className="size-40"
          />
          <CardDescription>
            Ingresá tu email y te mandamos un link mágico para entrar. Sin
            contraseñas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
