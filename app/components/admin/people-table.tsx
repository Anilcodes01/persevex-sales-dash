"use client";
import { EmployeeAvatar } from "../avatars/employee-avatar";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { jobRoleLabel, accessLabel } from "../../../shared/roles";
import type { RosterAccount } from "../../lib/api";
import { PeopleActions } from "./people-actions";
import type { Action } from "./types";
export function PeopleTable({
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
    <div className="table-scroll" aria-busy={loading}>
      <Table className="people-table">
        <TableHeader>
          <TableRow>
            <TableHead>Team member</TableHead>
            <TableHead>Job role</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="actions-heading">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((person) => (
            <TableRow key={person.id}>
              <TableCell>
                <div className="person-cell">
                  <EmployeeAvatar accountId={person.id} name={person.displayName} />
                  <div>
                    <strong>
                      {person.displayName}
                      {person.id === currentAccountId && <small> You</small>}
                    </strong>
                    <span>{person.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div>{jobRoleLabel(person.jobRole)}</div>
              </TableCell>
              <TableCell>{person.teams?.map((team) => team.name).join(", ") || "Not assigned"}</TableCell>
              <TableCell>
                <div>{accessLabel(person.role)}</div>
              </TableCell>
              <TableCell>
                <span
                  className={`status-tag ${person.active ? "active" : "inactive"}`}
                >
                  <span />
                  {person.active ? "Active" : "Inactive"}
                </span>
              </TableCell>
              <TableCell className="date-cell">
                {new Date(person.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Kolkata",
                })}
              </TableCell>
              <TableCell>
                <div className="row-actions">
                  <PeopleActions
                    person={person}
                    currentAccountId={currentAccountId}
                    open={open}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
