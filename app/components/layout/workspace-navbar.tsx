import { Badge } from "@/components/ui/badge";
export function WorkspaceNavbar({
  workspace,
  page,
  badge,
}: {
  workspace: string;
  page: string;
  badge: string;
}) {
  return (
    <header className="workspace-header">
      <span>
        {workspace} <span className="breadcrumb-slash">/</span>
        <strong>{page}</strong>
      </span>
    </header>
  );
}
