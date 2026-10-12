"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
type Person = { id: string; displayName: string; email: string; role: string };
type Member = {
  id: string;
  displayName: string;
  email: string;
  active: number;
};
type Team = {
  id: string;
  name: string;
  members: Member[];
  manager: { id: string; displayName: string; active: number } | null;
};
type Directory = { teams: Team[]; people: Person[] };
export default function TeamsPanel({
  onSessionExpired,
}: {
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState<Directory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Directory>("/api/admin/teams")
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          setError(err instanceof Error ? err.message : "Could not load teams");
        }),
    [onSessionExpired],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const team =
    data?.teams.find((item) => item.id === selectedId) || data?.teams[0];
  async function mutate(
    path: string,
    body: object,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      setNotice(message);
      await load();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      setError(err instanceof Error ? err.message : "Unable to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, teamId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await mutate(
        "/api/admin/teams/save",
        { ...Object.fromEntries(new FormData(form)), teamId },
        teamId ? "Team details updated." : "Team created.",
      )
    ) {
      if (!teamId) {
        form.reset();
        setCreating(false);
      }
    }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team) return;
    const form = event.currentTarget;
    if (
      await mutate(
        "/api/admin/teams/assign",
        { accountId: new FormData(form).get("accountId"), teamId: team.id },
        "Employee assigned. Previous team history has been preserved.",
      )
    )
      form.reset();
  }
  const managers =
    data?.people.filter((person) => person.role === "manager") || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STRONGER TOGETHER</p>
          <h1>Organise your teams.</h1>
          <p className="page-subtitle">
            Assign employees and give each team a manager.
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => setCreating(!creating)}
        >
          {creating ? "Cancel" : "＋ Create team"}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error} <button onClick={load}>Retry</button>
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {creating && (
        <section className="roster-panel team-create">
          <div className="panel-title">
            <h2>Create a team</h2>
          </div>
          <form
            onSubmit={(event) => save(event)}
            className="account-form team-inline-form"
          >
            <label>
              Team name
              <input
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Sales North"
              />
            </label>
            <label>
              Manager
              <select name="managerId" defaultValue="">
                <option value="">Assign later</option>
                {managers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName} · {person.email}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Create team"}
            </button>
          </form>
        </section>
      )}
      {!data && !error && <p role="status">Loading teams…</p>}
      {data && !data.teams.length && (
        <section className="roster-panel empty-state">
          <span aria-hidden="true">◎</span>
          <h3>Give your people a team</h3>
          <p>
            Create your first team, then assign employees from your directory.
          </p>
        </section>
      )}
      {data && team && (
        <div className="teams-grid">
          <section className="roster-panel team-directory">
            <div className="panel-title">
              <h2>
                Teams{" "}
                <span className="feature-status">{data.teams.length}</span>
              </h2>
            </div>
            <nav aria-label="Team selection">
              {data.teams.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  className={`team-select ${item.id === team.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  aria-current={item.id === team.id ? "true" : undefined}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {item.members.length} member
                    {item.members.length === 1 ? "" : "s"} ·{" "}
                    {item.manager?.displayName || "No manager"}
                    {item.manager && !item.manager.active ? " (inactive)" : ""}
                  </span>
                </button>
              ))}
            </nav>
          </section>
          <div>
            <section className="roster-panel">
              <div className="panel-title">
                <div>
                  <h2>{team.name}</h2>
                  <p>
                    One manager per team. A manager may oversee several teams.
                  </p>
                </div>
              </div>
              <form
                key={`${team.id}:${team.name}:${team.manager?.id}`}
                onSubmit={(event) => save(event, team.id)}
                className="account-form team-inline-form"
              >
                <label>
                  Team name
                  <input
                    name="name"
                    defaultValue={team.name}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Manager
                  <select
                    name="managerId"
                    defaultValue={team.manager?.id || ""}
                  >
                    <option value="">No manager</option>
                    {team.manager && !team.manager.active && (
                      <option value={team.manager.id} disabled>
                        {team.manager.displayName} (inactive — choose another)
                      </option>
                    )}
                    {managers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName} · {person.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving…" : "Save team"}
                </button>
              </form>
            </section>
            <section className="roster-panel team-members-panel">
              <div className="panel-title">
                <div>
                  <h2>Team members</h2>
                  <p>Employees belong to one current team.</p>
                </div>
              </div>
              <form
                onSubmit={assign}
                className="account-form team-assignment-form"
              >
                <label>
                  Assign an employee
                  <select name="accountId" required defaultValue="">
                    <option value="" disabled>
                      Select employee
                    </option>
                    {data.people
                      .filter(
                        (person) =>
                          person.role === "employee" &&
                          !team.members.some(
                            (member) => member.id === person.id,
                          ),
                      )
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName} · {person.email}
                        </option>
                      ))}
                  </select>
                  <span className="field-help">
                    Assigning someone from another team transfers them. Their
                    history is retained.
                  </span>
                </label>
                <button className="button primary" disabled={busy}>
                  Assign employee
                </button>
              </form>
              <div className="team-members">
                {team.members.map((member) => (
                  <div className="team-member" key={member.id}>
                    <div>
                      <strong>{member.displayName}</strong>
                      <span>
                        {member.email}
                        {!member.active ? " · Inactive account" : ""}
                      </span>
                    </div>
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          "/api/admin/teams/assign",
                          { accountId: member.id, teamId: "" },
                          "Employee removed from the current team. History is preserved.",
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {!team.members.length && (
                  <p className="team-empty">
                    No employees assigned to this team yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
      <p className="workspace-footer">
        PERSEVEX SALES WORKSPACE
        <span>Team assignments are managed by administrators.</span>
      </p>
    </>
  );
}
