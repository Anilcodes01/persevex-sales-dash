"use client";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
export type NavigationItem = {
  id: string;
  label: string;
  icon: string | LucideIcon;
  count?: number | string;
};
export type WorkspaceSidebarProps = {
  navigationLabel: string;
  navigationClassName: string;
  items: NavigationItem[];
  activeItem: string;
  onNavigate: (id: string) => void;
};
export function WorkspaceSidebar({
  navigationLabel,
  navigationClassName,
  items,
  activeItem,
  onNavigate,
}: WorkspaceSidebarProps) {
  return (
    <aside className="sidebar">
      <nav aria-label={navigationLabel} className={navigationClassName}>
        {items.map((item) => (
          <Button
            key={item.id}
            className={`nav-item ${activeItem === item.id ? "selected" : ""}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activeItem === item.id ? "page" : undefined}
          >
            <span aria-hidden="true">
              {typeof item.icon === "string" ? (
                item.icon
              ) : (
                <item.icon size={16} />
              )}
            </span>
            {item.label}
            {item.count !== undefined && (
              <span className="nav-count">{item.count}</span>
            )}
          </Button>
        ))}
      </nav>
    </aside>
  );
}
