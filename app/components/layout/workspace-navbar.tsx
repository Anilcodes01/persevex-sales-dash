import { SalesSoundControl } from "../sounds/sales-sound-control";
import { MobileAccountPanel } from "./mobile-account-panel";
import { Brand } from "./brand";
import type { ReactNode } from "react";
import { AccountMenu, type AccountMenuProps } from "./account-menu";
export type WorkspaceNavbarProps = AccountMenuProps & {
  homeHref: string;
  homeLabel: string;
  action?: ReactNode;
};
export function WorkspaceNavbar({
  homeHref,
  homeLabel,
  action,
  ...accountProps
}: WorkspaceNavbarProps) {
  return (
    <header className="workspace-header">
      <div className="navbar-left">
        <Brand href={homeHref} label={homeLabel} />
      </div>
      <div className="navbar-actions">
        {action}
        {(accountProps.account.role === "admin" || accountProps.account.jobRole === "team_lead") && <SalesSoundControl accountId={accountProps.account.id} expanded />}
        <div className="desktop-account-menu"><AccountMenu {...accountProps} /></div>
        <MobileAccountPanel {...accountProps} />
      </div>
    </header>
  );
}
