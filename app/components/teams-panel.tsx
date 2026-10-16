"use client";
import { useNotificationState } from "../hooks/use-notification-state";
import { SearchableSelect } from "./forms/searchable-select";
import { TeamEditor } from "./teams/team-editor";
import { WorkspaceDialog } from "./layout/workspace-dialog";
import { Users, Pencil, Plus, Trash2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { PageHeading } from "./layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { jobRoleLabel } from "../../shared/roles";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
type Person = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  jobRole: string;
};
type Member = {
  id: string;
  displayName: string;
  email: string;
  active: number;
  jobRole: string;
};
type Team = {
  id: string;
  name: string;
  members: Member[];
  manager: Member | null;
};
type Directory = { teams: Team[]; people: Person[] };
export default function TeamsPanel({
  onSessionExpired,
}: {
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState<Directory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useNotificationState();
  const [, setNotice] = useNotificationState("success");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Directory>("/api/admin/teams")
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          setError(err instanceof Error ? err.message : "Could not load teams");
        }),
    [onSessionExpired, setError],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const team =
    data?.teams.find((item) => item.id === selectedId) || data?.teams[0];
  const teamPeople = team
    ? [
        ...(team.manager ? [team.manager] : []),
        ...team.members.filter((member) => member.id !== team.manager?.id),
      ]
    : [];
  async function mutate(
    path: string,
    body: object,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ teamId?: string }>(path, body);
      if (result.teamId) {
        setSelectedId(result.teamId);
      }
      setNotice(message);
      await load();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      setError(err instanceof Error ? err.message : "Unable to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, teamId?: string) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    if (
      await mutate(
        "/api/admin/teams/save",
        { ...Object.fromEntries(new FormData(form)), teamId },
        teamId ? "Team details updated." : "Team created.",
      )
    ) {
      setCreating(false);
      setEditing(false);
    }
  }
  const teamLeads =
    data?.people.filter((person) => person.jobRole === "team_lead") || [];
  const available =
    data?.people.filter(
      (person) =>
        person.role === "employee" &&
        !team?.members.some((member) => member.id === person.id),
    ) ?? [];
  return (
    <>
      <PageHeading
        title="Teams"
        description="Manage teams, Team Leads and employee assignments."
        action={
          <Button onClick={() => setCreating(true)} disabled={busy || !data}>
            <Plus size={16} />
            Create team
          </Button>
        }
      />
      {error && (
        <Button variant="outline" onClick={load}>
          Retry loading teams
        </Button>
      )}
      {!data && !error && <p role="status">Loading teams…</p>}
      {data && (
        <>
          {data.teams.length ? (
            <div className="teams-selection-toolbar">
              <Label>
                Team ({data.teams.length})
                <SearchableSelect
                  label="Teams"
                  allLabel="Choose a team"
                  includeAll={false}
                  disabled={busy}
                  value={team?.id ?? ""}
                  onChange={setSelectedId}
                  options={data.teams.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.manager?.displayName ?? "No Team Lead"}`,
                  }))}
                />
              </Label>
              <span>Select a team to manage its people.</span>
            </div>
          ) : (
            <section className="roster-panel teams-directory-empty">
              <Users size={28} />
              <h3>No teams yet</h3>
              <p>Create a team to get started.</p>
            </section>
          )}
          {team && (
            <section
              className="roster-panel teams-selected-panel"
              aria-label={`${team.name} team details`}
            >
              <div className="panel-title">
                <div>
                  <h2>{team.name}</h2>
                  <p>
                    Team Lead:{" "}
                    <strong>
                      {team.manager?.displayName || "Not assigned"}
                    </strong>
                    {team.manager && !team.manager.active ? " · Inactive" : ""}{" "}
                    · {team.members.length} employees
                  </p>
                </div>
                <div className="teams-detail-actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 size={16} />
                    Delete team
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={16} />
                    Edit team
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setEmployeeId("");
                      setAdding(true);
                    }}
                  >
                    <Plus size={16} />
                    Add employee
                  </Button>
                </div>
              </div>
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="teams-member-action">
                        Manage
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamPeople.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <strong>{member.displayName}</strong>
                        </TableCell>
                        <TableCell>
                          {member.id === team.manager?.id
                            ? "Team Lead"
                            : jobRoleLabel(member.jobRole)}
                        </TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {member.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="teams-member-action">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                aria-label={`Options for ${member.displayName}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="team-actions-menu">
                              {member.id === team.manager?.id ? (
                                <DropdownMenuItem
                                  onSelect={() => setEditing(true)}
                                >
                                  <Pencil />
                                  Edit Team Lead
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    void mutate(
                                      "/api/admin/teams/assign",
                                      { accountId: member.id, teamId: "" },
                                      "Employee removed. Team history is preserved.",
                                    )
                                  }
                                >
                                  <Trash2 />
                                  Remove from team
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!teamPeople.length && (
                <div className="teams-directory-empty">
                  <Users size={28} />
                  <h3>No employees in this team</h3>
                  <p>Use Add employee to assign people to {team.name}.</p>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {deleting && team && (
        <WorkspaceDialog
          title={`Delete ${team.name}?`}
          description="This removes the team from active lists. Employees and the Team Lead will be unassigned from this team. Past sales and assignment history will be preserved."
          locked={busy}
          onClose={() => setDeleting(false)}
        >
          <div className="account-form">
            <p>
              Delete <strong>{team.name}</strong> with {teamPeople.length}{" "}
              assigned people?
            </p>
            <div className="dialog-footer">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  if (
                    await mutate(
                      "/api/admin/teams/delete",
                      { teamId: team.id },
                      "Team deleted. Past sales and history are preserved.",
                    )
                  ) {
                    setDeleting(false);
                    setSelectedId("");
                  }
                }}
              >
                {busy ? "Deleting…" : "Delete team"}
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      )}
      {(creating || (editing && team)) && (
        <TeamEditor
          key={editing ? team?.id : "create"}
          team={editing ? team : undefined}
          teams={data?.teams ?? []}
          leads={teamLeads}
          busy={busy}
          onSave={save}
          onClose={() => {
            setCreating(false);
            setEditing(false);
          }}
        />
      )}
      {adding && team && (
        <WorkspaceDialog
          title={`Add employee to ${team.name}`}
          description="Choose an employee from your directory."
          locked={busy}
          onClose={() => setAdding(false)}
        >
          <form
            className="account-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!employeeId || busy) return;
              if (
                await mutate(
                  "/api/admin/teams/assign",
                  { accountId: employeeId, teamId: team.id },
                  "Employee assigned. Previous team history is preserved.",
                )
              )
                setAdding(false);
            }}
          >
            <Label>
              Employee
              <SearchableSelect
                label="Employees"
                allLabel="Select employee"
                value={employeeId}
                onChange={setEmployeeId}
                options={available.map((person) => ({
                  value: person.id,
                  label: `${person.displayName} · ${person.email}`,
                }))}
              />
            </Label>
            {employeeId && (
              <p className="field-help">
                {(() => {
                  const previous = data?.teams.find((item) =>
                    item.members.some((member) => member.id === employeeId),
                  );
                  return previous
                    ? `This employee is currently in ${previous.name}. Adding them transfers them to ${team.name}; their history is preserved.`
                    : "This employee is currently unassigned.";
                })()}
              </p>
            )}
            {!available.length && <p>No eligible employees are available.</p>}
            <div className="dialog-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy || !employeeId}>
                {busy ? "Adding…" : "Add employee"}
              </Button>
            </div>
          </form>
        </WorkspaceDialog>
      )}
    </>
  );
}
