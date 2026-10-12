import type { Roster } from "./types";
export function PeopleStats({ stats }: { stats?: Roster["stats"] }) {
  return (
    <section className="stat-grid" aria-label="Account statistics">
      {[
        ["Total accounts", stats?.total, "Across your workspace"],
        ["Active accounts", stats?.active, "Currently able to sign in"],
        ["Employee access", stats?.employees, "Employee accounts"],
        ["Manager access", stats?.managers, "Manager accounts"],
      ].map(([label, value, caption]) => (
        <div className="stat-card" key={label}>
          <p>{label}</p>
          <strong>{value ?? "—"}</strong>
          <span>{caption}</span>
        </div>
      ))}
    </section>
  );
}
