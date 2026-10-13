"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../lib/api";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { SaleForm } from "./sale-form";
import type { SalesContext } from "./types";
export function CreateSaleDialog({
  accountId,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  accountId: string;
  onClose: () => void;
  onSaved: () => void;
  onSessionExpired: () => void;
}) {
  const [context, setContext] = useState<SalesContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const load = useCallback(
    () =>
      api<SalesContext>("/api/employee/sales/context")
        .then((result) => {
          if (active.current) {
            setContext(result);
            setFailed(false);
          }
        })
        .catch((error) => {
          if (!active.current) return;
          setFailed(true);
          if (error instanceof ApiError && error.status === 401)
            onSessionExpired();
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not load your assigned teams",
          );
        }),
    [onSessionExpired],
  );
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);
  return (
    <WorkspaceDialog
      title="Create sale"
      description="Enter student details and sale amounts. Approval is required."
      locked={busy}
      onClose={onClose}
      className="create-sale-dialog"
    >
      {context ? (
        <SaleForm
          key={accountId}
          accountId={accountId}
          context={context}
          inDialog
          onBusyChange={setBusy}
          onSaved={onSaved}
        />
      ) : (
        <div className="sales-panel">
          <p role="status">
            {failed
              ? "Could not load your team assignments."
              : "Loading your team assignments…"}
          </p>
          {failed && (
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          )}
        </div>
      )}
    </WorkspaceDialog>
  );
}
