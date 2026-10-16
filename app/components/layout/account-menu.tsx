"use client";
import { EmployeeAvatar } from "../avatars/employee-avatar";
import { COLOR_THEMES } from "../../../shared/color-themes";
import { useColorTheme } from "../color-theme-provider";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  LogOut,
  Settings,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import type { Account } from "../../lib/api";

import type { WorkspaceSidebarProps } from "./workspace-sidebar";
export type AccountMenuProps = {
  account: Account;
  accountLabel: string;
  settingsLabel: string;
  onSettings: () => void;
  onLogout: () => void;
  signingOut?: boolean;
  mobileNavigation?: WorkspaceSidebarProps;
};
export function AccountMenu({
  account,
  accountLabel,
  settingsLabel,
  onSettings,
  onLogout,
  signingOut = false,
  mobileNavigation,
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="navbar-account"
          aria-label={`Open account menu for ${account.displayName}`}
        >
          <EmployeeAvatar accountId={account.id} name={account.displayName} />
          <span className="navbar-account-name">{account.displayName}</span>
          <ChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="account-menu-content">
        <DropdownMenuLabel className="account-menu-identity">
          <strong>{account.displayName}</strong>
          <span>{account.email}</span>
          <small>{accountLabel}</small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mobileNavigation && (
          <div className="mobile-account-navigation">
            <DropdownMenuLabel>{mobileNavigation.navigationLabel}</DropdownMenuLabel>
            {mobileNavigation.items.map(item => (
              <DropdownMenuItem key={item.id} onSelect={() => mobileNavigation.onNavigate(item.id)} aria-current={mobileNavigation.activeItem === item.id ? "page" : undefined}>
                {typeof item.icon === "string" ? <span aria-hidden="true">{item.icon}</span> : <item.icon />}
                {item.label}
                {item.count !== undefined && <span className="ml-auto">{item.count}</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        )}
        <DropdownMenuItem onSelect={onSettings}>
          <Settings />
          {settingsLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme || "light"}
          onValueChange={setTheme}
          className="appearance-options"
          aria-label="Appearance"
        >
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme colour</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={colorTheme}
          onValueChange={setColorTheme}
          className="theme-colour-options"
          aria-label="Theme colour"
        >
          {COLOR_THEMES.map((colour) => (
            <DropdownMenuRadioItem
              key={colour.value}
              value={colour.value}
              className="theme-colour-option"
              aria-label={colour.label}
              title={colour.label}
            >
              <span
                className="theme-colour-swatch"
                style={{ backgroundColor: colour.swatch }}
                aria-hidden="true"
              />
              <span className="sr-only">{colour.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={onLogout}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
