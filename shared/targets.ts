export const TARGET_BASES = [
  { value: "sales_count", label: "Number of sales" },
  { value: "registration", label: "Registration amount" },
  { value: "overall", label: "Overall amount (total sale value)" },
] as const;
export type TargetBasis = (typeof TARGET_BASES)[number]["value"];
export function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
export function monthDates(month = currentMonth()) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}
