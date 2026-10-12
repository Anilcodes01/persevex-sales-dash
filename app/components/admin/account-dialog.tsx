"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOB_ROLES } from "../../../shared/roles";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import type { PeopleDirectory } from "../../hooks/use-people-directory";
import { ACCOUNT_ACTION_TITLES } from "./types";
export function AccountDialog({ directory }: { directory: PeopleDirectory }) {
  const { selection, busy, setSelection, mutate, dialogError } = directory;
  if (!selection) return null;
  return (
    <WorkspaceDialog
      locked={busy}
      title={ACCOUNT_ACTION_TITLES[selection.action]}
      description="Manage this account’s details and access."
      onClose={() => {
        if (!busy) setSelection(null);
      }}
    >
      <form onSubmit={mutate} className="account-form">
        {(selection.action === "create" || selection.action === "edit") && (
          <>
            <Label>
              Full name
              <Input
                name="displayName"
                defaultValue={selection.account?.displayName}
                placeholder="e.g. Aditi Sharma"
                maxLength={100}
                required
                autoComplete="off"
              />
            </Label>
            <Label>
              Email address
              <Input
                name="email"
                type="email"
                defaultValue={selection.account?.email}
                placeholder="name@company.com"
                maxLength={254}
                required
                autoComplete="off"
              />
            </Label>
            <Label>
              Job role
              <select
                name="jobRole"
                defaultValue={selection.account?.jobRole ?? "employee"}
              >
                {JOB_ROLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Workspace access
              <select
                name="role"
                defaultValue={selection.account?.role ?? "employee"}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </select>
              <span className="field-help">
                Controls permissions separately from the job title. Choose
                Manager access to oversee teams.
              </span>
            </Label>
          </>
        )}
        {(selection.action === "create" || selection.action === "reset") && (
          <>
            <Label>
              Temporary password
              <Input
                name="password"
                type="password"
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
                required
              />
              <span className="field-help">
                15–128 characters. They must change it at first sign-in.
              </span>
            </Label>
            {selection.action === "reset" && (
              <p className="notice warning">
                Resetting {selection.account?.displayName}&apos;s password signs
                them out on every device.
              </p>
            )}
          </>
        )}
        {(selection.action === "disable" || selection.action === "enable") && (
          <p className="dialog-description">
            {selection.action === "disable"
              ? `${selection.account?.displayName} will lose access immediately. Their account stays in the directory and can be reactivated later.`
              : `${selection.account?.displayName} will be able to sign in again with their existing credentials.`}
          </p>
        )}
        {dialogError && (
          <p className="notice error" role="alert">
            {dialogError}
          </p>
        )}
        <div className="dialog-footer">
          <Button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => setSelection(null)}
          >
            Cancel
          </Button>
          <Button
            className={`button ${selection.action === "disable" ? "danger" : "primary"}`}
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : selection.action === "create"
                ? "Create account"
                : selection.action === "edit"
                  ? "Save changes"
                  : ACCOUNT_ACTION_TITLES[selection.action]}
          </Button>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
