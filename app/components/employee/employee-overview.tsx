"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import { initials } from "../../lib/display";
import { jobRoleLabel } from "../../../shared/roles";
import EmployeeTeam from "../employee-team";
export function EmployeeOverview({
  account,
  onAccount,
}: {
  account: Account;
  onAccount: () => void;
}) {
  return (
    <>
      <section className="employee-welcome">
        <div>
          <p className="eyebrow">READY FOR WHAT&apos;S NEXT</p>
          <h2>Your workspace.</h2>
          <p>
            Your account is ready. Sales entry and manager approvals are the
            next features we&apos;re building.
          </p>
          <Button className="button primary" onClick={onAccount}>
            View my account <span aria-hidden="true">↗</span>
          </Button>
        </div>
        <div className="welcome-monogram" aria-hidden="true">
          <span>{initials(account.displayName)}</span>
          <small>PERSEVEX TEAM</small>
        </div>
      </section>
      <div className="employee-section-heading">
        <h2>Your performance</h2>
        <span>Available when sales tracking is enabled</span>
      </div>
      <section
        className="stat-grid employee-stats"
        aria-label="Performance availability"
      >
        {[
          {
            label: "Collected revenue",
            caption: "Approved collections, less refunds",
          },
          {
            label: "Sales count",
            caption: "Your eligible, approved sales",
          },
          {
            label: "Target achievement",
            caption: "Progress against your assigned target",
          },
        ].map((metric) => (
          <div className="stat-card" key={metric.label}>
            <p>{metric.label}</p>
            <strong aria-label="Not available yet">—</strong>
            <span>{metric.caption}</span>
          </div>
        ))}
      </section>
      <EmployeeTeam manager={account.role === "manager"} />
      <div className="employee-overview-grid">
        <section className="roster-panel" aria-labelledby="activity-heading">
          <div className="panel-title">
            <div>
              <h2 id="activity-heading">Sales activity</h2>
              <p>Your submissions and approval updates will appear here.</p>
            </div>
            <Badge className="feature-status">Coming next</Badge>
          </div>
          <div className="empty-state">
            <span aria-hidden="true">◎</span>
            <h3>Sales tracking is on the way</h3>
            <p>
              Once it&apos;s enabled, you&apos;ll be able to post sales, track
              their status, and review your history from this workspace.
            </p>
          </div>
        </section>
        <section className="roster-panel employee-profile-summary">
          <div className="panel-title">
            <div>
              <h2>Your account</h2>
              <p>Connected to your workspace.</p>
            </div>
          </div>
          <div className="employee-profile-body">
            <span className="avatar large-avatar">
              {initials(account.displayName)}
            </span>
            <h3>{account.displayName}</h3>
            <p>{account.email}</p>
            <Badge className="role-tag">{jobRoleLabel(account.jobRole)}</Badge>
            <Button className="button ghost" onClick={onAccount}>
              Manage my account
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
