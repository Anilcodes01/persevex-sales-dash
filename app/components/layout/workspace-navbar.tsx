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
        <div className="desktop-account-menu"><AccountMenu {...accountProps} /></div>
        <MobileAccountPanel {...accountProps} />
      </div>
    </header>
  );
}
