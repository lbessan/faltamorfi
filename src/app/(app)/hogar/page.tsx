import type { Metadata } from "next";
import { Home } from "lucide-react";
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
        <div className="rounded-full bg-muted p-3">
          <Home className="size-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{household.name}</h1>
          <p className="text-sm text-muted-foreground">
            Sesión: {user?.email}
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          Ubicaciones
        </h2>
        <ul className="rounded-lg border border-border divide-y divide-border">
          {locations.map((loc) => (
            <li key={loc.id} className="px-4 py-3 text-sm">
              {loc.name}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-2">
          La edición de ubicaciones y la invitación de familiares vienen en la
          Fase 5.
        </p>
      </section>
    </div>
  );
}
