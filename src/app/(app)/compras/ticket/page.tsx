import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listProducts } from "@/lib/db/products";
import { canEdit } from "@/lib/database.types";
import { TicketView } from "./_components/ticket-view";

export const metadata: Metadata = {
  title: "Cargar ticket",
};

export default async function TicketPage() {
  const supabase = await createClient();
  const household = await requireCurrentHousehold(supabase);
  const role = await getCurrentHouseholdRole(supabase, household.id);

  if (!canEdit(role)) {
    redirect("/compras");
  }

  const products = await listProducts(supabase, household.id);
  // Solo los activos. Mandamos lo mínimo para el matching.
  const catalog = products
    .filter((p) => p.is_active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      icon: p.icon,
      unit: p.unit,
    }));

  return <TicketView catalog={catalog} />;
}
