import type { Account } from "../../lib/api";
export type EmployeeDashboardProps = {
  account: Account;
  statusMessage: string;
  onSessionExpired: () => void;
  onSignedOut: () => void;
  onPasswordChanged: () => void;
};
