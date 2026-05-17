import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/lib/db/invitations";

export const metadata: Metadata = {
  title: "Invitación",
};

type Params = Promise<{ token: string }>;

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si no está logueado, lo mandamos a login con next= así vuelve acá después.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Intentar aceptar.
  try {
    await acceptInvitation(supabase, token);
  } catch (err) {
    return (
      <InviteError
        message={err instanceof Error ? err.message : "Invitación inválida."}
      />
    );
  }

  // Listo: redirigimos a /hogar.
  redirect("/hogar");
}

function InviteError({ message }: { message: string }) {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="size-14 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
          <TriangleAlert className="size-7 text-destructive" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">
            Invitación inválida
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Link
          href="/hogar"
          className={buttonVariants({ variant: "default", size: "lg" }) + " w-full"}
        >
          Volver al hogar
        </Link>
      </div>
    </main>
  );
}

