"use client";

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
  const [error, setError] = useState("");
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
    [manager],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section
      className="roster-panel employee-team-summary"
      aria-labelledby="my-team-heading"
    >
      <div>
        <p className="eyebrow">{manager ? "MY TEAMS" : "MY TEAM"}</p>
        <h2 id="my-team-heading">
          {result
            ? manager
              ? result.teams?.map((team) => team.name).join(", ") ||
                "No teams assigned yet"
              : result.team?.name || "No team assigned yet"
            : "Loading your team…"}
        </h2>
        <p>
          {manager
            ? "Teams you oversee. Your administrator manages these assignments."
            : result?.team
              ? `Manager: ${result.team.managerName || "No active manager assigned"}`
              : result
                ? "Your administrator can assign you to a team."
                : "Your team details will appear here."}
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error} <Button onClick={load}>Retry</Button>
        </p>
      )}
    </section>
  );
}
