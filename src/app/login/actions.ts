"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export async function signInWithMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "Ingresá un email válido." };
  }

  const next = String(formData.get("next") ?? "").trim();

  const supabase = await createClient();
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const callback = new URL("/auth/callback", origin);
  if (next && next.startsWith("/")) {
    callback.searchParams.set("next", next);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback.toString(),
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return {
    status: "success",
    message: `Te mandamos un link a ${email}. Revisá tu casilla (mirá también el spam).`,
  };
}
