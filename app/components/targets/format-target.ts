import type { TargetBasis } from "../../../shared/targets";
import { money } from "../sales/types";

export function formatTarget(value: number | null, basis: TargetBasis | null) {
  if (value === null) return "Not set";
  return basis === "sales_count"
    ? `${value.toLocaleString("en-IN")} sales`
    : money(value);
}
