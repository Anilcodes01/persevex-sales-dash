import { Brand } from "./brand";
import { AccountMenu, type AccountMenuProps } from "./account-menu";
export type WorkspaceNavbarProps = AccountMenuProps & {
  homeHref: string;
  homeLabel: string;
  page: string;
};
export function WorkspaceNavbar({
  homeHref,
  homeLabel,
  page,
  ...accountProps
}: WorkspaceNavbarProps) {
  return (
    <header className="workspace-header">
      <div className="navbar-left">
        <Brand href={homeHref} label={homeLabel} />
        <span className="navbar-page">{page}</span>
      </div>
      <AccountMenu {...accountProps} />
    </header>
  );
}
