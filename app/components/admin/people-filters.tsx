"use client";
import { SearchableSelect } from "../forms/searchable-select";
import { FormSelect, SelectOption } from "../forms/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOB_ROLES } from "../../../shared/roles";
import type { PeopleDirectory } from "../../hooks/use-people-directory";
export function PeopleFilters({ directory }: { directory: PeopleDirectory }) {
  const {
    teamId,
    setTeamId,
    roster,
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
      <SearchableSelect
        label="Team"
        allLabel="All teams"
        value={teamId}
        onChange={(value) => { setTeamId(value); setPage(1); }}
        options={(roster?.teams ?? []).map((team) => ({ value: team.id, label: team.name }))}
      />
      <Label className="sr-only" htmlFor="role-filter">
        Filter role
      </Label>
      <FormSelect
        id="role-filter"
        value={role}
        onChange={(event) => {
          setRole(event.target.value);
          setPage(1);
        }}
      >
        <SelectOption value="all">All access levels</SelectOption>
        <SelectOption value="employee">Employees</SelectOption>
        <SelectOption value="manager">Managers</SelectOption>
        <SelectOption value="admin">Administrators</SelectOption>
      </FormSelect>
      <Label className="sr-only" htmlFor="job-role-filter">
        Filter job role
      </Label>
      <FormSelect
        id="job-role-filter"
        value={jobRole}
        onChange={(event) => {
          setJobRole(event.target.value);
          setPage(1);
        }}
      >
        <SelectOption value="all">All job roles</SelectOption>
        {JOB_ROLES.map((item) => (
          <SelectOption key={item.value} value={item.value}>
            {item.label}
          </SelectOption>
        ))}
      </FormSelect>
      <Label className="sr-only" htmlFor="status-filter">
        Filter status
      </Label>
      <FormSelect
        id="status-filter"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
      >
        <SelectOption value="all">All statuses</SelectOption>
        <SelectOption value="active">Active</SelectOption>
        <SelectOption value="inactive">Inactive</SelectOption>
      </FormSelect>
    </div>
  );
}
