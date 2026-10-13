"use client";
import { useNotificationState } from "../../hooks/use-notification-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormEvent, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { jobRoleLabel, accessLabel } from "../../../shared/roles";
import type { EmployeeDashboardProps } from "./types";
export function AccountSettings({
  account,
  onPasswordChanged,
  onSessionExpired,
}: Pick<
  EmployeeDashboardProps,
  "account" | "onPasswordChanged" | "onSessionExpired"
>) {
  const [busy, setBusy] = useState(false);
  const [, setError] = useNotificationState();
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      form.reset();
      onPasswordChanged();
    } catch (err) {
      if (err instanceof ApiError && err.message === "Please sign in")
        onSessionExpired();
      setError(
        err instanceof Error ? err.message : "Unable to change your password",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="employee-account-grid">
      <section
        className="roster-panel profile-panel"
        aria-labelledby="profile-heading"
      >
        <div className="panel-title">
          <div>
            <h2 id="profile-heading">Your profile</h2>
            <p>Account details managed by your administrator.</p>
          </div>
        </div>
        <dl className="profile-details">
          <div>
            <dt>Job role</dt>
            <dd>{jobRoleLabel(account.jobRole)}</dd>
          </div>
          <div>
            <dt>Full name</dt>
            <dd>{account.displayName}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Workspace access</dt>
            <dd>{accessLabel(account.role)}</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>
              <span className="status-tag active">
                <span />
                Active
              </span>
            </dd>
          </div>
        </dl>
        <p className="profile-footnote">
          Contact your administrator to update your name or email address.
        </p>
      </section>
      <section className="roster-panel" aria-labelledby="security-heading">
        <div className="panel-title">
          <div>
            <h2 id="security-heading">Change password</h2>
            <p>Changing your password signs you out on every device.</p>
          </div>
        </div>
        <form
          onSubmit={changePassword}
          className="account-form employee-password-form"
        >
          <Label>
            Current password
            <Input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </Label>
          <Label>
            New password
            <Input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              minLength={6}
              maxLength={128}
              required
            />
            <span className="field-help">
              Use 6–128 characters. Choose a long, memorable passphrase.
            </span>
          </Label>
          <Label>
            Confirm new password
            <Input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={6}
              maxLength={128}
              required
            />
          </Label>

          <Button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      </section>
    </div>
  );
}
