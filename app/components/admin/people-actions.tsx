"use client";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { RosterAccount } from "../../lib/api";
import type { Action } from "./types";
export function PeopleActions({
  person,
  currentAccountId,
  open,
}: {
  person: RosterAccount;
  currentAccountId: string;
  open: (action: Action, person?: RosterAccount) => void;
}) {
  return (
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
        <DropdownMenuItem variant="destructive" onSelect={() => open("resetSales", person)}>
          Reset sales
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
  );
}
