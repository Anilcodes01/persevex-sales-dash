"use client";
import { AvatarUpload } from "../avatars/avatar-upload";
import { jobRoleLabel, accessLabel } from "../../../shared/roles";
import type { Account } from "../../lib/api";
export function AccountSettings({ account }: { account: Account }) {
  return (
    <div className="employee-account-grid profile-only">
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
        <div className="profile-avatar-section"><AvatarUpload key={account.id} accountId={account.id} name={account.displayName} /></div>
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
    </div>
  );
}
