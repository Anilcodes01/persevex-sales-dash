"use client";
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
import { initials } from "../../lib/display";
export type AccountMenuProps = {
  account: Account;
  accountLabel: string;
  settingsLabel: string;
  onSettings: () => void;
  onLogout: () => void;
  signingOut?: boolean;
};
export function AccountMenu({
  account,
  accountLabel,
  settingsLabel,
  onSettings,
  onLogout,
  signingOut = false,
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="navbar-account"
          aria-label={`Open account menu for ${account.displayName}`}
        >
          <span className="avatar">{initials(account.displayName)}</span>
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
        <DropdownMenuItem onSelect={onSettings}>
          <Settings />
          {settingsLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme || "light"}
          onValueChange={setTheme}
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
        <DropdownMenuItem disabled={signingOut} onSelect={onLogout}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
