import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { ChatView } from "./_components/chat-view";

export const metadata: Metadata = {
  title: "Asistente",
};

export default async function AsistentePage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);

  return <ChatView householdName={household.name} />;
}
