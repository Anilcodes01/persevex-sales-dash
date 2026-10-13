"use client";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import type { PeopleDirectory } from "../../hooks/use-people-directory";
import { PageHeading } from "../layout/page-heading";
import { PeopleFilters } from "./people-filters";
import { PeopleTable } from "./people-table";
import { PeopleStats } from "./people-stats";
export function PeoplePanel({
  account,
  directory,
}: {
  account: Account;
  directory: PeopleDirectory;
  statusMessage: string;
}) {
  const {
    roster,
    loading,
    error,
    refresh,
    open,
    search,
    role,
    jobRole,
    status,
    page,
    setPage,
  } = directory;
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE"
        title="People"
        description="Manage accounts, job roles and access."
        action={
          <Button className="button primary" onClick={() => open("create")}>
            <span aria-hidden="true">＋</span> Add employee
          </Button>
        }
      />
      <PeopleStats stats={roster?.stats} />

      {error && <Button onClick={refresh}>Retry</Button>}
      <section className="roster-panel" aria-labelledby="roster-title">
        <div className="panel-title">
          <div>
            <h2 id="roster-title">People directory</h2>
            <p>Your workspace accounts and their access levels.</p>
          </div>
          <Button className="button ghost" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </Button>
        </div>
        <PeopleFilters directory={directory} />
        <PeopleTable
          accounts={roster?.accounts ?? []}
          currentAccountId={account.id}
          loading={loading}
          open={open}
        />
        {!loading && !error && !roster?.accounts.length && (
          <div className="empty-state">
            <span>◎</span>
            <h3>
              {search || role !== "all" || jobRole !== "all" || status !== "all"
                ? "No matching accounts"
                : "Your team starts here"}
            </h3>
            <p>
              {search || role !== "all" || jobRole !== "all" || status !== "all"
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
            <Button
              disabled={loading || page === 1}
              onClick={() => setPage(page - 1)}
            >
              ← Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={
                loading || !roster || page * roster.pageSize >= roster.total
              }
              onClick={() => setPage(page + 1)}
            >
              Next →
            </Button>
          </div>
        </footer>
      </section>
    </>
  );
}
