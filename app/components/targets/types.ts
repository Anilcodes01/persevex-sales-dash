import type { TargetBasis } from "../../../shared/targets";
export type Performance = {
  id: string;
  targetId: string | null;
  fromDate: string | null;
  toDate: string | null;
  displayName: string;
  jobRole: string;
  basis: TargetBasis | null;
  targetPaise: number | null;
  revision: number | null;
  registrationPaise: number;
  overallPaise: number;
  approvedCount: number;
  missingOverallCount: number;
  achievedPaise: number;
  achievement: number | null;
  remainingPaise: number | null;
};
export type TargetsPage = {
  month: string;
  from: string;
  to: string;
  people: Performance[];
  targets: Performance[];
};
