import type { Metadata } from "next";
import { Home, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentHousehold } from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";

export const metadata: Metadata = {
  title: "Hogar",
};

export default async function HogarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const household = await requireCurrentHousehold(supabase);
  const locations = await listLocations(supabase, household.id);

  return (
    <div className="px-4 py-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Home className="size-7 text-primary" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold truncate">
            {household.name}
          </h1>
          <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ubicaciones
        </h2>
        <ul className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {locations.map((loc) => (
            <li key={loc.id} className="px-4 py-3 flex items-center gap-3">
              <MapPin className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{loc.name}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/80 px-1 pt-1">
          La edición de ubicaciones y la invitación de familiares vienen en la
          Fase 5.
        </p>
      </section>
    </div>
  );
}
