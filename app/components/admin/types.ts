import type { RosterAccount } from "../../lib/api";

export type Roster = {
  accounts: RosterAccount[];
  teams: { id: string; name: string }[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; active: number; employees: number; managers: number };
};
export type Action = "create" | "edit" | "reset" | "disable" | "enable" | "resetSales";
export type Selection = { action: Action; account?: RosterAccount };

export const ACCOUNT_ACTION_TITLES: Record<Action, string> = {
  resetSales: "Reset sales",
  create: "Create account",
  edit: "Edit account",
  reset: "Reset password",
  disable: "Disable account",
  enable: "Reactivate account",
};
