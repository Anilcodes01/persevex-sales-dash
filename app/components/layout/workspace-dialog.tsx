"use client";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function WorkspaceDialog({
  title,
  description,
  children,
  onClose,
  locked,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  locked: boolean;
  className?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        className={`account-dialog ${className}`.trim()}
        showCloseButton={!locked}
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (locked) event.preventDefault();
        }}
      >
        <DialogHeader className="dialog-header">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
