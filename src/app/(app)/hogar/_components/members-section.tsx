"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogOut,
  MoreVertical,
  ShieldUser,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ROLE_LABELS,
  type HouseholdInvitation,
  type HouseholdRole,
} from "@/lib/database.types";
import type { HouseholdMemberWithEmail } from "@/lib/db/household";
import {
  changeMemberRoleAction,
  leaveHouseholdAction,
  removeMemberAction,
} from "../actions";
import { InviteDialog } from "./invite-dialog";
import { JoinByCodeDialog } from "./join-by-code-dialog";

type Props = {
  members: HouseholdMemberWithEmail[];
  invitations: HouseholdInvitation[];
  role: HouseholdRole | null;
  currentUserId: string | null;
};

export function MembersSection({
  members,
  invitations,
  role,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  function changeRole(userId: string, newRole: HouseholdRole) {
    setError(null);
    startTransition(async () => {
      const result = await changeMemberRoleAction(userId, newRole);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove(userId: string, name: string) {
    if (!confirm(`¿Sacar a ${name} del hogar?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction(userId);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function leave() {
    if (!confirm("¿Salir del hogar? Vas a perder acceso a su inventario.")) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveHouseholdAction();
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          Miembros ({members.length})
        </h2>
        <div className="flex gap-1">
          {role === "owner" && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => setInviteOpen(true)}
              className="h-7"
            >
              <UserPlus className="size-3.5" />
              Invitar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="h-7"
          >
            Unirme con código
          </Button>
        </div>
      </div>

      <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            currentUserId={currentUserId}
            currentRole={role}
            pending={pending}
            onChangeRole={changeRole}
            onRemove={remove}
            onLeave={leave}
          />
        ))}
      </ul>

      {/* Invitaciones pendientes (solo owner las ve) */}
      {role === "owner" && invitations.length > 0 && (
        <div className="mt-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Invitaciones pendientes
          </h3>
          <ul className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
            {invitations.map((inv) => (
              <PendingInvitationRow key={inv.id} invitation={inv} />
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs text-destructive border border-destructive/30 rounded-md px-2 py-1.5"
        >
          {error}
        </p>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </section>
  );
}

// ----------------------------------------------------------------------------

function MemberRow({
  member,
  currentUserId,
  currentRole,
  pending,
  onChangeRole,
  onRemove,
  onLeave,
}: {
  member: HouseholdMemberWithEmail;
  currentUserId: string | null;
  currentRole: HouseholdRole | null;
  pending: boolean;
  onChangeRole: (userId: string, role: HouseholdRole) => void;
  onRemove: (userId: string, name: string) => void;
  onLeave: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isSelf = member.user_id === currentUserId;
  const canManage = currentRole === "owner" && !isSelf;
  const displayName =
    member.email ?? (isSelf ? "Vos" : `Miembro ${member.user_id.slice(0, 6)}`);

  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        <ShieldUser className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {displayName}
          {isSelf && (
            <span className="text-xs text-muted-foreground ml-1">(vos)</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {ROLE_LABELS[member.role]}
        </div>
      </div>

      {(canManage || (isSelf && currentRole !== "owner")) && (
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((v) => !v)}
            className="size-7"
            disabled={pending}
            aria-label="Más"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MoreVertical className="size-3.5" />
            )}
          </Button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-8 z-20 min-w-44 rounded-lg border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                {canManage && (
                  <>
                    <MenuOption
                      label="Hacer dueño"
                      disabled={member.role === "owner"}
                      onClick={() => {
                        setMenuOpen(false);
                        onChangeRole(member.user_id, "owner");
                      }}
                    />
                    <MenuOption
                      label="Hacer miembro"
                      disabled={member.role === "member"}
                      onClick={() => {
                        setMenuOpen(false);
                        onChangeRole(member.user_id, "member");
                      }}
                    />
                    <MenuOption
                      label="Solo lectura"
                      disabled={member.role === "viewer"}
                      onClick={() => {
                        setMenuOpen(false);
                        onChangeRole(member.user_id, "viewer");
                      }}
                    />
                    <div className="border-t border-border" />
                    <MenuOption
                      label="Sacar del hogar"
                      icon={UserMinus}
                      destructive
                      onClick={() => {
                        setMenuOpen(false);
                        onRemove(member.user_id, displayName);
                      }}
                    />
                  </>
                )}
                {isSelf && currentRole !== "owner" && (
                  <MenuOption
                    label="Salir del hogar"
                    icon={LogOut}
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      onLeave();
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function MenuOption({
  label,
  icon: Icon,
  disabled,
  destructive,
  onClick,
}: {
  label: string;
  icon?: typeof UserMinus;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-accent"
      }`}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
    </button>
  );
}

function PendingInvitationRow({
  invitation,
}: {
  invitation: HouseholdInvitation;
}) {
  const expiresIn = formatExpiresIn(invitation.expires_at);
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-mono font-medium">{invitation.code}</div>
          <div className="text-[11px] text-muted-foreground">
            {ROLE_LABELS[invitation.role]} · {expiresIn}
          </div>
        </div>
      </div>
    </li>
  );
}

function formatExpiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "vencida";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `vence en ${hours}h`;
  const minutes = Math.floor(ms / (60 * 1000));
  return `vence en ${minutes}m`;
}
