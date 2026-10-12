"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TeamsPanel from "./teams-panel";
import { Account, ApiError, RosterAccount, api } from "../lib/api";

type Roster = {
  accounts: RosterAccount[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; active: number; employees: number; managers: number };
};
type Action = "create" | "edit" | "reset" | "disable" | "enable";
type Selection = { action: Action; account?: RosterAccount };
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function Dialog({
  title,
  children,
  onClose,
  locked,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  locked: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="account-dialog"
      onCancel={(event) => {
        if (locked) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-header">
        <div>
          <p className="eyebrow">ACCOUNT MANAGEMENT</p>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          disabled={locked}
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function AdminDashboard({
  account,
  onSessionExpired,
  onPassword,
  onLogout,
  onAccountUpdated,
  statusMessage,
}: {
  account: Account;
  onSessionExpired: () => void;
  onPassword: () => void;
  onLogout: () => void;
  onAccountUpdated: () => void;
  statusMessage: string;
}) {
  const [view, setView] = useState<"people" | "teams">("people");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const requestSerial = useRef(0);
  const filterKey = JSON.stringify([search, role, status, page]);
  const loading = refreshing || loadedKey !== filterKey;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(() => {
    const serial = ++requestSerial.current;
    const params = new URLSearchParams({
      q: search,
      role,
      status,
      page: String(page),
    });
    return api<Roster>(`/api/admin/accounts?${params}`)
      .then((result) => {
        if (serial !== requestSerial.current) return;
        setError("");
        setRoster(result);
      })
      .catch((err) => {
        if (serial !== requestSerial.current) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        setError(
          err instanceof Error ? err.message : "Could not load accounts",
        );
      })
      .finally(() => {
        if (serial === requestSerial.current) {
          setLoadedKey(filterKey);
          setRefreshing(false);
        }
      });
  }, [search, role, status, page, filterKey, onSessionExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  function refresh() {
    setRefreshing(true);
    void load();
  }
  function open(action: Action, person?: RosterAccount) {
    setSelection({ action, account: person });
    setDialogError("");
  }
  async function mutate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setDialogError("");
    setNotice("");
    try {
      const paths: Record<Action, string> = {
        create: "/api/admin/accounts",
        edit: "/api/admin/accounts/update",
        reset: "/api/admin/accounts/reset-password",
        disable: "/api/admin/accounts/disable",
        enable: "/api/admin/accounts/enable",
      };
      await api(paths[selection.action], {
        ...values,
        accountId: selection.account?.id,
      });
      const messages: Record<Action, string> = {
        create:
          "Account created. Share the temporary password privately; the employee will choose their own at first sign-in.",
        edit: "Account details updated.",
        reset: "Temporary password saved. Existing sessions have been revoked.",
        disable: "Account disabled. Access has been revoked.",
        enable: "Account reactivated.",
      };
      setNotice(messages[selection.action]);
      form.reset();
      setSelection(null);
      if (selection.account?.id === account.id) {
        if (selection.action === "reset") {
          onSessionExpired();
          return;
        }
        onAccountUpdated();
      }
      setRefreshing(true);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      setDialogError(
        err instanceof Error ? err.message : "Could not save account",
      );
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<Action, string> = {
    create: "Add a team member",
    edit: "Edit account",
    reset: "Reset password",
    disable: "Disable account",
    enable: "Reactivate account",
  };
  const stats = roster?.stats;
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Persevex home">
          <span className="brand-mark">P</span>persevex
          <span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">SALES WORKSPACE</div>
        <nav aria-label="Administration" className="admin-navigation">
          <button
            className={`nav-item ${view === "people" ? "selected" : ""}`}
            onClick={() => setView("people")}
            aria-current={view === "people" ? "page" : undefined}
          >
            <span>▦</span>People
            <span className="nav-count">{stats?.total ?? "—"}</span>
          </button>
          <button
            className={`nav-item ${view === "teams" ? "selected" : ""}`}
            onClick={() => setView("teams")}
            aria-current={view === "teams" ? "page" : undefined}
          >
            <span>◎</span>Teams
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-dot" />
          Administration<p>Manage who has access to your sales workspace.</p>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{initials(account.displayName)}</span>
          <div>
            <strong>{account.displayName}</strong>
            <span>Administrator</span>
          </div>
        </div>
        <button className="sidebar-link" onClick={onPassword}>
          Change password
        </button>
        <button className="sidebar-link" onClick={onLogout}>
          Sign out ↗
        </button>
      </aside>
      <main className="admin-main">
        <header className="workspace-header">
          <span>
            Workspace <span className="breadcrumb-slash">/</span>{" "}
            <strong>{view === "teams" ? "Teams" : "People"}</strong>
          </span>
          <span className="workspace-badge">ADMIN CONSOLE</span>
        </header>
        <div className="admin-content">
          {view === "teams" ? (
            <TeamsPanel onSessionExpired={onSessionExpired} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR PEOPLE, ONE PLACE</p>
                  <h1>Build your team.</h1>
                  <p className="page-subtitle">
                    Create accounts and manage access across your organisation.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => open("create")}
                >
                  <span aria-hidden="true">＋</span> Add employee
                </button>
              </div>
              <section className="stat-grid" aria-label="Account statistics">
                {[
                  ["Total accounts", stats?.total, "Across your workspace"],
                  [
                    "Active accounts",
                    stats?.active,
                    "Currently able to sign in",
                  ],
                  ["Employees", stats?.employees, "Employee accounts"],
                  ["Managers", stats?.managers, "Manager accounts"],
                ].map(([label, value, caption]) => (
                  <div className="stat-card" key={label}>
                    <p>{label}</p>
                    <strong>{value ?? "—"}</strong>
                    <span>{caption}</span>
                  </div>
                ))}
              </section>
              {statusMessage && (
                <p className="notice error" role="alert">
                  {statusMessage}
                </p>
              )}
              {notice && (
                <p className="notice success" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error} <button onClick={refresh}>Retry</button>
                </p>
              )}
              <section className="roster-panel" aria-labelledby="roster-title">
                <div className="panel-title">
                  <div>
                    <h2 id="roster-title">People directory</h2>
                    <p>Your workspace accounts and their access levels.</p>
                  </div>
                  <button
                    className="button ghost"
                    onClick={refresh}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "↻ Refresh"}
                  </button>
                </div>
                <div className="roster-toolbar">
                  <form
                    className="search-field"
                    role="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setSearch(query);
                      setPage(1);
                    }}
                  >
                    <label className="sr-only" htmlFor="roster-search">
                      Search by name or email
                    </label>
                    <input
                      id="roster-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name or email…"
                      maxLength={100}
                    />
                    <button aria-label="Search accounts" type="submit">
                      ⌕
                    </button>
                  </form>
                  <label className="sr-only" htmlFor="role-filter">
                    Filter role
                  </label>
                  <select
                    id="role-filter"
                    value={role}
                    onChange={(event) => {
                      setRole(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All roles</option>
                    <option value="employee">Employees</option>
                    <option value="manager">Managers</option>
                    <option value="admin">Administrators</option>
                  </select>
                  <label className="sr-only" htmlFor="status-filter">
                    Filter status
                  </label>
                  <select
                    id="status-filter"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="table-scroll" aria-busy={loading}>
                  <table className="people-table">
                    <thead>
                      <tr>
                        <th>Team member</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Added</th>
                        <th className="actions-heading">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster?.accounts.map((person) => (
                        <tr key={person.id}>
                          <td>
                            <div className="person-cell">
                              <span className="avatar">
                                {initials(person.displayName)}
                              </span>
                              <div>
                                <strong>
                                  {person.displayName}
                                  {person.id === account.id && (
                                    <small> You</small>
                                  )}
                                </strong>
                                <span>{person.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`role-tag ${person.role}`}>
                              {person.role === "admin"
                                ? "Administrator"
                                : person.role === "manager"
                                  ? "Manager"
                                  : "Employee"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`status-tag ${person.active ? "active" : "inactive"}`}
                            >
                              <span />
                              {person.active ? "Active" : "Inactive"}
                            </span>
                            {person.active && person.mustChangePassword && (
                              <small className="pending-password">
                                Password change required
                              </small>
                            )}
                          </td>
                          <td className="date-cell">
                            {new Date(person.createdAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                timeZone: "Asia/Kolkata",
                              },
                            )}
                          </td>
                          <td>
                            <div className="row-actions">
                              <button onClick={() => open("edit", person)}>
                                Edit
                              </button>
                              <button onClick={() => open("reset", person)}>
                                Reset password
                              </button>
                              {person.id !== account.id && (
                                <button
                                  className={person.active ? "danger-link" : ""}
                                  onClick={() =>
                                    open(
                                      person.active ? "disable" : "enable",
                                      person,
                                    )
                                  }
                                >
                                  {person.active ? "Disable" : "Reactivate"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!loading && !error && !roster?.accounts.length && (
                  <div className="empty-state">
                    <span>◎</span>
                    <h3>
                      {search || role !== "all" || status !== "all"
                        ? "No matching accounts"
                        : "Your team starts here"}
                    </h3>
                    <p>
                      {search || role !== "all" || status !== "all"
                        ? "Try a different search or filter."
                        : "Add your first employee to give them access to the workspace."}
                    </p>
                  </div>
                )}
                <footer className="table-footer">
                  <span>
                    {loading
                      ? "Loading directory…"
                      : `${roster?.total ?? 0} account${roster?.total === 1 ? "" : "s"} found`}
                  </span>
                  <div>
                    <button
                      disabled={loading || page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      ← Previous
                    </button>
                    <span>Page {page}</span>
                    <button
                      disabled={
                        loading ||
                        !roster ||
                        page * roster.pageSize >= roster.total
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </footer>
              </section>
              <p className="workspace-footer">
                PERSEVEX SALES WORKSPACE{" "}
                <span>Employee access is managed by administrators.</span>
              </p>
            </>
          )}
        </div>
      </main>
      {selection && (
        <Dialog
          locked={busy}
          title={titles[selection.action]}
          onClose={() => {
            if (!busy) setSelection(null);
          }}
        >
          <form onSubmit={mutate} className="account-form">
            {(selection.action === "create" || selection.action === "edit") && (
              <>
                <label>
                  Full name
                  <input
                    name="displayName"
                    defaultValue={selection.account?.displayName}
                    placeholder="e.g. Aditi Sharma"
                    maxLength={100}
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    defaultValue={selection.account?.email}
                    placeholder="name@company.com"
                    maxLength={254}
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  Access role
                  <select
                    name="role"
                    defaultValue={selection.account?.role ?? "employee"}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
              </>
            )}
            {(selection.action === "create" ||
              selection.action === "reset") && (
              <>
                <label>
                  Temporary password
                  <input
                    name="password"
                    type="password"
                    minLength={15}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                  <span className="field-help">
                    15–128 characters. They must change it at first sign-in.
                  </span>
                </label>
                {selection.action === "reset" && (
                  <p className="notice warning">
                    Resetting {selection.account?.displayName}&apos;s password
                    signs them out on every device.
                  </p>
                )}
              </>
            )}
            {(selection.action === "disable" ||
              selection.action === "enable") && (
              <p className="dialog-description">
                {selection.action === "disable"
                  ? `${selection.account?.displayName} will lose access immediately. Their account stays in the directory and can be reactivated later.`
                  : `${selection.account?.displayName} will be able to sign in again with their existing credentials.`}
              </p>
            )}
            {dialogError && (
              <p className="notice error" role="alert">
                {dialogError}
              </p>
            )}
            <div className="dialog-footer">
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Cancel
              </button>
              <button
                className={`button ${selection.action === "disable" ? "danger" : "primary"}`}
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : selection.action === "create"
                    ? "Create account"
                    : selection.action === "edit"
                      ? "Save changes"
                      : titles[selection.action]}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
