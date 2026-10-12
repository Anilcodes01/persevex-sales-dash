"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { initials } from "../../lib/display";
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
                  <span className="avatar">{initials(person.displayName)}</span>
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
                <Badge className="role-tag">
                  {jobRoleLabel(person.jobRole)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={`role-tag ${person.role}`}>
                  {accessLabel(person.role)}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  className={`status-tag ${person.active ? "active" : "inactive"}`}
                >
                  <span />
                  {person.active ? "Active" : "Inactive"}
                </span>
                {person.active && person.mustChangePassword && (
                  <small className="pending-password">
                    Password change required
                  </small>
                )}
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
                  <Button onClick={() => open("edit", person)}>Edit</Button>
                  <Button onClick={() => open("reset", person)}>
                    Reset password
                  </Button>
                  {person.id !== currentAccountId && (
                    <Button
                      className={person.active ? "danger-link" : ""}
                      onClick={() =>
                        open(person.active ? "disable" : "enable", person)
                      }
                    >
                      {person.active ? "Disable" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
