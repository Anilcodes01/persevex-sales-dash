"use client";
import { useEffect, useState } from "react";
import { Dialog as Sheet } from "radix-ui";
import { LogOut, Settings, Sun, Moon, Monitor, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { COLOR_THEMES } from "../../../shared/color-themes";
import { useColorTheme } from "../color-theme-provider";
import { initials } from "../../lib/display";
import type { AccountMenuProps } from "./account-menu";

export function MobileAccountPanel({ account, accountLabel, settingsLabel, onSettings, onLogout, signingOut, mobileNavigation }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const closeOnDesktop = () => { if (!media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  function navigate(action: () => void) { setOpen(false); action(); }
  return (
    <Sheet.Root open={open} onOpenChange={setOpen}>
      <Sheet.Trigger asChild>
        <Button variant="ghost" className="navbar-account mobile-account-trigger" aria-label={`Open navigation for ${account.displayName}`}>
          <span className="avatar">{initials(account.displayName)}</span>
        </Button>
      </Sheet.Trigger>
      <Sheet.Portal>
        <Sheet.Overlay className="mobile-panel-overlay" />
        <Sheet.Content className="mobile-account-panel">
          <div className="mobile-panel-heading">
            <Sheet.Title>My workspace</Sheet.Title>
            <Sheet.Close asChild><Button variant="ghost" size="icon" aria-label="Close navigation"><X /></Button></Sheet.Close>
          </div>
          <div className="account-menu-identity">
            <strong>{account.displayName}</strong><span>{account.email}</span><small>{accountLabel}</small>
          </div>
          <Sheet.Description className="sr-only">Navigation and account preferences</Sheet.Description>
          {mobileNavigation && <nav aria-label={mobileNavigation.navigationLabel} className="mobile-panel-navigation">
            <p>{mobileNavigation.navigationLabel}</p>
            {mobileNavigation.items.map(item => <Button key={item.id} variant="ghost" aria-current={mobileNavigation.activeItem === item.id ? "page" : undefined} onClick={() => navigate(() => mobileNavigation.onNavigate(item.id))}>
              {typeof item.icon === "string" ? <span aria-hidden="true">{item.icon}</span> : <item.icon />}
              {item.label}{item.count !== undefined && <span className="ml-auto">{item.count}</span>}
            </Button>)}
          </nav>}
          <Button variant="ghost" className="mobile-panel-action" onClick={() => navigate(onSettings)}><Settings />{settingsLabel}</Button>
          <section className="mobile-panel-preferences" aria-label="Appearance">
            <h3>Appearance</h3>
            <div className="mobile-appearance-options">
              {[{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }].map(option => <Button key={option.value} variant="outline" aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}><option.icon />{option.label}</Button>)}
            </div>
            <h3>Theme colour</h3>
            <div className="mobile-colour-options">
              {COLOR_THEMES.map(colour => <Button key={colour.value} variant="ghost" aria-label={colour.label} title={colour.label} aria-pressed={colorTheme === colour.value} onClick={() => setColorTheme(colour.value)}><span style={{ backgroundColor: colour.swatch }} /></Button>)}
            </div>
          </section>
          <Button variant="ghost" className="mobile-panel-action" disabled={signingOut} onClick={() => navigate(onLogout)}><LogOut />{signingOut ? "Signing out…" : "Sign out"}</Button>
        </Sheet.Content>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
