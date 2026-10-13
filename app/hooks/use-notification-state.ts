"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";

// Keep error state available for retry/empty views while announcing via toast.
export function useNotificationState(kind: "error" | "success" = "error") {
  const [message, setMessage] = useState("");
  const notify = useCallback(
    (next: string) => {
      setMessage(next);
      if (next) toast[kind](next);
    },
    [kind],
  );
  return [message, notify] as const;
}
