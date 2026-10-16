"use client";
import type { RosterAccount } from "../../lib/api";
import type { Action } from "./types";
import { jobRoleLabel, accessLabel } from "../../../shared/roles";
import { EmployeeAvatar } from "../avatars/employee-avatar";
import { PeopleActions } from "./people-actions";

export function PeopleGrid({
  accounts,
  currentAccountId,
  loading,
  open,
}: {
  accounts: RosterAccount[];
  currentAccountId: string;
  loading: boolean;
  open: (action: Action, person?: RosterAccount) => void;
}) {
  return (
    <div
      className="people-card-grid"
      aria-label="Employee grid"
      aria-busy={loading}
    >
      {accounts.map((person) => (
        <article className="people-directory-card" key={person.id}>
          <div className="people-card-top">
            <EmployeeAvatar accountId={person.id} name={person.displayName} className="people-card-avatar" />
            <PeopleActions
              person={person}
              currentAccountId={currentAccountId}
              open={open}
            />
          </div>
          <div>
            <h3>
              {person.displayName}
              {person.id === currentAccountId && <small> · You</small>}
            </h3>
            <p className="people-card-email">{person.email}</p>
          </div>
          <dl>
            <div>
              <dt>Position</dt>
              <dd>{jobRoleLabel(person.jobRole)}</dd>
            </div>
            <div>
              <dt>Team</dt>
              <dd>{person.teams?.map((team) => team.name).join(", ") || "Not assigned"}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{accessLabel(person.role)}</dd>
            </div>
          </dl>
          <div className="people-card-bottom">
            <span
              className={`status-tag ${person.active ? "active" : "inactive"}`}
            >
              <span />
              {person.active ? "Active" : "Inactive"}
            </span>
            <time dateTime={new Date(person.createdAt).toISOString()}>
              {new Date(person.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </time>
          </div>
        </article>
      ))}
    </div>
  );
}
