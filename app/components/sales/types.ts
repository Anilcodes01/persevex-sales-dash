export type Sale = {
  id: string;
  employeeId: string;
  employeeName: string;
  teamId: string;
  teamName: string;
  studentName: string;
  phone: string;
  domain: string;
  note: string;
  amountPaise: number;
  overallAmountPaise: number | null;
  remainingAmountPaise: number | null;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  reviewedAt: number | null;
  reviewerName: string | null;
  reviewReason: string | null;
};
export type SalesPage = {
  teams?: { id: string; name: string }[];
  employees?: { id: string; name: string; email: string }[];
  sales: Sale[];
  total: number;
  page: number;
  pageSize: number;
  totals: { approvedAmountPaise: number; approvedCount: number };
};
export type SalesContext = {
  teams: { id: string; name: string }[];
  canReview: boolean;
};
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );
