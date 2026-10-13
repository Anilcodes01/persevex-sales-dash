"use client";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
                  <span className="">
                    <User className="" />
                  </span>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Manage ${person.displayName}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => open("edit", person)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => open("reset", person)}>
                        Reset password
                      </DropdownMenuItem>
                      {person.id !== currentAccountId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant={person.active ? "destructive" : "default"}
                            onSelect={() =>
                              open(person.active ? "disable" : "enable", person)
                            }
                          >
                            {person.active ? "Disable" : "Reactivate"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
