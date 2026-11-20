import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Copy, MailPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AREA_ACTIONS,
  RBAC_AREAS,
  canAssignRole,
  canChangeAssignment,
  canSetActive,
  type RbacAction,
  type RbacArea,
} from "@/lib/rbac";

// Team — RBAC Phase 1 (2026-11-20, rbac-admin-design.md §5): the
// platform owner's staff page. Everyone listed holds ONE role at
// platform scope. All reads and writes run through the voice-agents
// function's team actions; the database's guarded RPCs are the real
// enforcement (no self-edits, no grants above your rank, only the
// Owner grants or removes Admins) — this page merely disables the
// controls the server would refuse anyway, using the mirror rules in
// src/lib/rbac.ts. Staff are deactivated, never deleted.

interface TeamRole {
  key: string;
  name: string;
  rank: number;
  permissions: string[];
}
interface TeamMember {
  assignmentId: string;
  userId: string;
  email: string | null;
  name: string | null;
  roleKey: string | null;
  roleName: string | null;
  active: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}
interface TeamInvite {
  id: string;
  email: string;
  roleKey: string | null;
  roleName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  emailSent: boolean;
}
interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  area: string | null;
  targetType: string | null;
  targetId: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
}

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const formatDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

async function invokeTeam<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("voice-agents", { body });
  const payload = (data ?? {}) as T & { error?: string };
  if (error || payload.error) {
    throw new Error(payload.error || error?.message || "Request failed");
  }
  return payload;
}

const selectClass =
  "h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs";

export default function TeamView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  const rolesQuery = useQuery({
    queryKey: ["team-roles"],
    queryFn: () => invokeTeam<{ roles: TeamRole[]; myRoleKey: string | null }>({ action: "teamRoles" }),
  });
  const listQuery = useQuery({
    queryKey: ["team-list"],
    queryFn: () => invokeTeam<{ members: TeamMember[]; invites: TeamInvite[] }>({ action: "teamList" }),
    enabled: rolesQuery.isSuccess,
  });
  const auditQuery = useQuery({
    queryKey: ["team-audit"],
    queryFn: () => invokeTeam<{ entries: AuditEntry[] }>({ action: "teamAudit" }),
    enabled: rolesQuery.isSuccess,
  });

  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data]);
  const myRole = rolesQuery.data?.myRoleKey ?? null;
  const canManage = canAssignRole(myRole, "read_only") || myRole === "owner" || myRole === "admin";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["team-list"] });
    await queryClient.invalidateQueries({ queryKey: ["team-audit"] });
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !inviteRole) return;
    setBusy(true);
    try {
      const res = await invokeTeam<{ inviteUrl: string; emailSent: boolean }>({
        action: "teamInvite",
        userEmail: inviteEmail.trim(),
        roleKey: inviteRole,
      });
      setInviteUrl(res.inviteUrl);
      toast.success(res.emailSent ? t("team.inviteSent") : t("team.inviteCreatedNoEmail"));
      setInviteEmail("");
      await refresh();
    } catch (e) {
      toast.error(t("team.actionFailed"), { description: e instanceof Error ? e.message : undefined });
    }
    setBusy(false);
  };

  const changeRole = async (member: TeamMember, roleKey: string) => {
    setBusy(true);
    try {
      await invokeTeam({ action: "teamSetRole", targetUserId: member.userId, roleKey });
      toast.success(t("team.roleUpdated"));
      await refresh();
    } catch (e) {
      toast.error(t("team.actionFailed"), { description: e instanceof Error ? e.message : undefined });
    }
    setBusy(false);
  };

  const setActive = async (member: TeamMember, active: boolean) => {
    setBusy(true);
    try {
      await invokeTeam({ action: "teamSetActive", assignmentId: member.assignmentId, active });
      toast.success(active ? t("team.activated") : t("team.deactivated"));
      await refresh();
    } catch (e) {
      toast.error(t("team.actionFailed"), { description: e instanceof Error ? e.message : undefined });
    }
    setBusy(false);
  };

  const revokeInvite = async (invite: TeamInvite) => {
    setBusy(true);
    try {
      await invokeTeam({ action: "teamRevokeInvite", inviteId: invite.id });
      toast.success(t("team.inviteRevoked"));
      await refresh();
    } catch (e) {
      toast.error(t("team.actionFailed"), { description: e instanceof Error ? e.message : undefined });
    }
    setBusy(false);
  };

  if (rolesQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("team.loading")}</p>;
  }
  if (rolesQuery.isError) {
    return (
      <Card className="max-w-lg">
        <CardHeader><CardTitle className="text-lg">{t("team.restrictedTitle")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {rolesQuery.error instanceof Error ? rolesQuery.error.message : t("team.restrictedBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const members = listQuery.data?.members ?? [];
  const invites = (listQuery.data?.invites ?? []).filter((i) => i.status === "pending");
  const assignableRoles = roles.filter((r) => r.key !== "owner");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("team.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
      </div>

      {/* People */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("team.peopleTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("team.colPerson")}</th>
                  <th className="px-4 py-2 font-medium">{t("team.colRole")}</th>
                  <th className="px-4 py-2 font-medium">{t("team.colScope")}</th>
                  <th className="px-4 py-2 font-medium">{t("team.colStatus")}</th>
                  <th className="px-4 py-2 font-medium">{t("team.colLastActive")}</th>
                  <th className="px-4 py-2 font-medium">{t("team.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.userId === myUserId;
                  return (
                    <tr key={m.assignmentId} className="border-b border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.name || m.email || "—"}</p>
                        {m.email && m.name && <p className="text-xs text-muted-foreground">{m.email}</p>}
                        {isSelf && <Badge variant="secondary" className="mt-1 text-[10px]">{t("team.you")}</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={t("team.colRole")}
                          className={selectClass}
                          value={m.roleKey ?? ""}
                          disabled={busy || isSelf || !canChangeAssignment(myRole, m.roleKey, m.roleKey)}
                          onChange={(e) => void changeRole(m, e.target.value)}
                        >
                          {roles.map((r) => (
                            <option
                              key={r.key}
                              value={r.key}
                              disabled={r.key !== m.roleKey && !canChangeAssignment(myRole, m.roleKey, r.key)}
                            >
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">{t("team.scopePlatform")}</td>
                      <td className="px-4 py-3">
                        <Badge variant={m.active ? "outline" : "destructive"} className="text-[10px]">
                          {m.active ? t("team.statusActive") : t("team.statusDeactivated")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{formatDate(m.lastActiveAt)}</td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={busy || !canSetActive(myRole, m.roleKey, isSelf)}
                          onClick={() => void setActive(m, !m.active)}
                        >
                          {m.active ? t("team.deactivate") : t("team.activate")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">{t("team.noMembers")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Invite */}
          {canManage && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("team.inviteTitle")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("team.inviteEmailPlaceholder")}
                  className="h-8 w-64 text-xs"
                />
                <select
                  aria-label={t("team.colRole")}
                  className={selectClass}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="">{t("team.inviteRolePlaceholder")}</option>
                  {assignableRoles.map((r) => (
                    <option key={r.key} value={r.key} disabled={!canAssignRole(myRole, r.key)}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" className="h-8 px-3 text-[11px]" disabled={busy || !inviteEmail.trim() || !inviteRole} onClick={() => void sendInvite()}>
                  <MailPlus className="mr-1 h-3 w-3" /> {t("team.inviteButton")}
                </Button>
              </div>
              {inviteUrl && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("team.inviteLinkLabel")}</span>
                  <code className="max-w-full truncate rounded bg-muted px-2 py-1">{inviteUrl}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => toast.success(t("team.copied")))}
                  >
                    <Copy className="mr-1 h-3 w-3" /> {t("team.copy")}
                  </Button>
                </div>
              )}
              {invites.length > 0 && (
                <div className="mt-3 space-y-1">
                  {invites.map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span>{i.email}</span>
                      <Badge variant="outline" className="text-[10px]">{i.roleName}</Badge>
                      <span className="text-muted-foreground">
                        {i.emailSent ? t("team.inviteEmailed") : t("team.inviteNotEmailed")} · {t("team.inviteExpires", { date: formatDate(i.expiresAt) })}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" disabled={busy} onClick={() => void revokeInvite(i)}>
                        <X className="mr-1 h-3 w-3" /> {t("team.revoke")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permission matrix */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("team.matrixTitle")}</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">{t("team.matrixHint")}</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("team.colPermission")}</th>
                  {roles.map((r) => (
                    <th key={r.key} className="px-4 py-2 font-medium">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RBAC_AREAS.map((area: RbacArea) =>
                  AREA_ACTIONS[area].map((action: RbacAction) => (
                    <tr key={`${area}:${action}`} className="border-b border-border">
                      <td className="px-4 py-2 text-xs">
                        {t(`team.areas.${area}`)} · {t(`team.actions.${action}`)}
                      </td>
                      {roles.map((r) => (
                        <td key={r.key} className="px-4 py-2">
                          {r.permissions.includes(`${area}:${action}`) ? (
                            <Check className="h-4 w-4 text-emerald-500" aria-label={t("team.yes")} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("team.auditTitle")}</CardTitle></CardHeader>
        <CardContent>
          {auditQuery.isError ? (
            <p className="text-sm text-muted-foreground">{t("team.auditUnavailable")}</p>
          ) : (auditQuery.data?.entries ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("team.auditEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {(auditQuery.data?.entries ?? []).map((e) => (
                <div key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2 text-xs last:border-0">
                  <span className="font-medium">{t(`team.auditActions.${e.action}`, { defaultValue: e.action })}</span>
                  <span className="text-muted-foreground">{e.actorEmail ?? "—"}</span>
                  {e.targetId && <span className="text-muted-foreground">{e.targetId}</span>}
                  {e.summary?.role != null && <Badge variant="outline" className="text-[10px]">{String(e.summary.role)}</Badge>}
                  <span className="ml-auto text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
