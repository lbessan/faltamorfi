import type { Metadata } from "next";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentHouseholdRole,
  listHouseholdMembers,
  requireCurrentHousehold,
} from "@/lib/db/household";
import { listLocations } from "@/lib/db/locations";
import { getOrCreateUserPreferences } from "@/lib/db/preferences";
import { listProducts } from "@/lib/db/products";
import { listActiveInvitations } from "@/lib/db/invitations";
import { NotificationsSettings } from "./_components/notifications-settings";
import { TypesSettings } from "./_components/types-settings";
import { HouseholdSettings } from "./_components/household-settings";
import { MembersSection } from "./_components/members-section";

export const metadata: Metadata = {
  title: "Hogar",
};

export default async function HogarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const household = await requireCurrentHousehold(supabase);
  const role = user
    ? await getCurrentHouseholdRole(supabase, household.id)
    : null;

  const [locations, prefs, products, members, invitations] = await Promise.all([
    listLocations(supabase, household.id),
    user
      ? getOrCreateUserPreferences(supabase, user.id)
      : Promise.resolve(null),
    listProducts(supabase, household.id),
    user
      ? listHouseholdMembers(supabase, household.id, user.id, user.email ?? null)
      : Promise.resolve([]),
    role === "owner"
      ? listActiveInvitations(supabase, household.id)
      : Promise.resolve([]),
  ]);

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
          <p className="text-sm text-muted-foreground truncate">
            {user?.email}
          </p>
        </div>
      </div>

      <HouseholdSettings household={household} role={role} />

      <MembersSection
        members={members}
        invitations={invitations}
        role={role}
        currentUserId={user?.id ?? null}
      />

      <NotificationsSettings
        initialEnabled={prefs?.notifications_enabled ?? false}
        initialDays={prefs?.default_expiry_warning_days ?? 3}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      />

      {role === "owner" && <TypesSettings products={products} />}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ubicaciones
        </h2>
        <ul className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {locations.map((loc) => (
            <li key={loc.id} className="px-4 py-3 flex items-center gap-3">
              <span className="text-sm">{loc.name}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/80 px-1 pt-1">
          La edición de ubicaciones viene en una próxima iteración.
        </p>
      </section>
    </div>
  );
}
