"use client";
import { useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect, SelectOption } from "../forms/form-select";
import { WorkspaceDialog } from "../layout/workspace-dialog";

export function TeamEditor({
  team,
  leads,
  teams,
  busy,
  onSave,
  onClose,
}: {
  team?: {
    id: string;
    name: string;
    manager: { id: string; displayName: string; active: number } | null;
  };
  leads: { id: string; displayName: string; email: string }[];
  teams: { id: string; name: string; manager: { id: string } | null }[];
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>, teamId?: string) => void;
  onClose: () => void;
}) {
  const [managerId, setManagerId] = useState(team?.manager?.id ?? "");
  const otherTeams = teams.filter(
    (item) => item.id !== team?.id && item.manager?.id === managerId,
  );
  return (
    <WorkspaceDialog
      title={team ? "Edit team" : "Create team"}
      description="Name your team and choose who leads it."
      locked={busy}
      onClose={onClose}
    >
      <form
        className="account-form"
        onSubmit={(event) => onSave(event, team?.id)}
      >
        <fieldset disabled={busy}>
          <Label>
            Team name
            <Input
              name="name"
              defaultValue={team?.name ?? ""}
              required
              maxLength={80}
              placeholder="e.g. Sales North"
            />
          </Label>
          <Label>
            Team Lead
            <FormSelect
              name="managerId"
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
            >
              <SelectOption value="">Assign later</SelectOption>
              {team?.manager &&
                !leads.some((lead) => lead.id === team.manager?.id) && (
                  <SelectOption value={team.manager.id} disabled>
                    {team.manager.displayName} (inactive)
                  </SelectOption>
                )}
              {leads.map((lead) => (
                <SelectOption key={lead.id} value={lead.id}>
                  {lead.displayName} · {lead.email}
                </SelectOption>
              ))}
            </FormSelect>
          </Label>
          {otherTeams.length > 0 && (
            <div className="team-lead-warning" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <p>
                This person already leads{" "}
                <strong>
                  {otherTeams.map((item) => item.name).join(", ")}
                </strong>
                . Saving will assign them to this team as well; their existing
                team assignments will remain.
              </p>
            </div>
          )}
        </fieldset>
        <div className="dialog-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : team ? "Save changes" : "Create team"}
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
