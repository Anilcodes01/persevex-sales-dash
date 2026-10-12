export const JOB_ROLES = [
  { value: "employee", label: "Employee" },
  { value: "team_lead", label: "Team Lead" },
  {
    value: "business_development_executive",
    label: "Business Development Executive",
  },
  {
    value: "business_development_associate",
    label: "Business Development Associate",
  },
  {
    value: "business_development_manager",
    label: "Business Development Manager",
  },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
] as const;
export type JobRole = (typeof JOB_ROLES)[number]["value"];
export function isJobRole(value: unknown): value is JobRole {
  return JOB_ROLES.some((role) => role.value === value);
}
export function jobRoleLabel(value: string) {
  return JOB_ROLES.find((role) => role.value === value)?.label || "Employee";
}
export function accessLabel(role: string) {
  return role === "admin"
    ? "Administrator"
    : role === "manager"
      ? "Manager"
      : "Employee";
}
