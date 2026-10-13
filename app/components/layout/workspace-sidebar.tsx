"use client";
import { Button } from "@/components/ui/button";
export type NavigationItem = {
  id: string;
  label: string;
  icon: string;
  count?: number | string;
};
export function WorkspaceSidebar({
  navigationLabel,
  navigationClassName,
  items,
  activeItem,
  onNavigate,
}: {
  navigationLabel: string;
  navigationClassName: string;
  items: NavigationItem[];
  activeItem: string;
  onNavigate: (id: string) => void;
}) {
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
            <span aria-hidden="true">{item.icon}</span>
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
