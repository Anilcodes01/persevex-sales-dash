"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import { initials } from "../../lib/display";
import { jobRoleLabel } from "../../../shared/roles";
import { PersonalPerformance } from "../targets/personal-performance";
import EmployeeTeam from "../employee-team";
export function EmployeeOverview({
  account,
  onAccount,
  onSales,
  onSessionExpired,
}: {
  account: Account;
  onAccount: () => void;
  onSales: () => void;
  onSessionExpired: () => void;
}) {
  return (
    <>
      <PersonalPerformance
        accountId={account.id}
        onSessionExpired={onSessionExpired}
      />
      <EmployeeTeam
        manager={account.role === "manager" || account.jobRole === "team_lead"}
      />
     
    </>
  );
}
