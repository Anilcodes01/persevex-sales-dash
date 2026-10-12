"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOB_ROLES } from "../../../shared/roles";
import type { PeopleDirectory } from "../../hooks/use-people-directory";
export function PeopleFilters({ directory }: { directory: PeopleDirectory }) {
  const {
    query,
    setQuery,
    setSearch,
    setPage,
    role,
    setRole,
    jobRole,
    setJobRole,
    status,
    setStatus,
  } = directory;
  return (
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
        <Label className="sr-only" htmlFor="roster-search">
          Search by name or email
        </Label>
        <Input
          id="roster-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or email…"
          maxLength={100}
        />
        <Button aria-label="Search accounts" type="submit">
          ⌕
        </Button>
      </form>
      <Label className="sr-only" htmlFor="role-filter">
        Filter role
      </Label>
      <select
        id="role-filter"
        value={role}
        onChange={(event) => {
          setRole(event.target.value);
          setPage(1);
        }}
      >
        <option value="all">All access levels</option>
        <option value="employee">Employees</option>
        <option value="manager">Managers</option>
        <option value="admin">Administrators</option>
      </select>
      <Label className="sr-only" htmlFor="job-role-filter">
        Filter job role
      </Label>
      <select
        id="job-role-filter"
        value={jobRole}
        onChange={(event) => {
          setJobRole(event.target.value);
          setPage(1);
        }}
      >
        <option value="all">All job roles</option>
        {JOB_ROLES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <Label className="sr-only" htmlFor="status-filter">
        Filter status
      </Label>
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
  );
}
