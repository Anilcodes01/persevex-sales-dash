"use client";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import { initials } from "../../lib/display";
import { Brand } from "./brand";
export type NavigationItem = {
  id: string;
  label: string;
  icon: string;
  count?: number | string;
};
export function WorkspaceSidebar({
  account,
  accountLabel,
  homeHref,
  homeLabel,
  workspaceLabel,
  navigationLabel,
  navigationClassName,
  items,
  activeItem,
  onNavigate,
  noteTitle,
  noteDescription,
  settingsLabel,
  onSettings,
  onLogout,
  signingOut = false,
}: {
  account: Account;
  accountLabel: string;
  homeHref: string;
  homeLabel: string;
  workspaceLabel: string;
  navigationLabel: string;
  navigationClassName: string;
  items: NavigationItem[];
  activeItem: string;
  onNavigate: (id: string) => void;
  noteTitle: string;
  noteDescription: string;
  settingsLabel: string;
  onSettings: () => void;
  onLogout: () => void;
  signingOut?: boolean;
}) {
  return (
    <aside className="sidebar">
      <Brand href={homeHref} label={homeLabel} />
      <div className="workspace-label">{workspaceLabel}</div>
      <nav aria-label={navigationLabel} className={navigationClassName}>
        {items.map((item) => (
          <Button
            key={item.id}
            className={`nav-item ${activeItem === item.id ? "selected" : ""}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activeItem === item.id ? "page" : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
            {item.count !== undefined && (
              <span className="nav-count">{item.count}</span>
            )}
          </Button>
        ))}
      </nav>
      <div className="sidebar-note">
        <span className="small-dot" />
        {noteTitle}
        <p>{noteDescription}</p>
      </div>
      <div className="sidebar-account">
        <span className="avatar">{initials(account.displayName)}</span>
        <div>
          <strong>{account.displayName}</strong>
          <span>{accountLabel}</span>
        </div>
      </div>
      <Button className="sidebar-link" onClick={onSettings}>
        {settingsLabel}
      </Button>
      <Button className="sidebar-link" disabled={signingOut} onClick={onLogout}>
        {signingOut ? "Signing out…" : "Sign out ↗"}
      </Button>
    </aside>
  );
}
