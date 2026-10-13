"use client";
import { useNotificationState } from "../hooks/use-notification-state";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
type Team = { id: string; name: string; managerName: string | null };
export default function EmployeeTeam({
  manager = false,
}: {
  manager?: boolean;
}) {
  const [result, setResult] = useState<{
    team: Team | null;
    teams?: Team[];
  } | null>(null);
  const [error, setError] = useNotificationState();
  const load = useCallback(
    () =>
      api<{ team: Team | null; teams?: Team[] }>(
        manager ? "/api/manager/teams" : "/api/employee/team",
      )
        .then((data) => {
          setResult(data);
          setError("");
        })
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Unable to load your team",
          ),
        ),
    [manager, setError],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
   <div></div>
  );
}
