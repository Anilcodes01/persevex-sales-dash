"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
type Team = { id: string; name: string; managerName: string | null };
export default function EmployeeTeam() {
  const [result, setResult] = useState<{ team: Team | null } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<{ team: Team | null }>("/api/employee/team")
        .then((data) => {
          setResult(data);
          setError("");
        })
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Unable to load your team",
          ),
        ),
    [],
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
        <p className="eyebrow">MY TEAM</p>
        <h2 id="my-team-heading">
          {result
            ? result.team?.name || "No team assigned yet"
            : "Loading your team…"}
        </h2>
        <p>
          {result?.team
            ? `Manager: ${result.team.managerName || "No active manager assigned"}`
            : result
              ? "Your administrator can assign you to a team."
              : "Your team details will appear here."}
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error} <button onClick={load}>Retry</button>
        </p>
      )}
    </section>
  );
}
