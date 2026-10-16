import type { Organisation } from "./durable-objects/organisation";

export interface Env {
  ASSETS: Fetcher;
  ORGANISATION: DurableObjectNamespace<Organisation>;
  BOOTSTRAP_ADMIN_SECRET?: string;
  LOCAL_DEVELOPMENT?: string;
  DEV_FRONTEND_ORIGIN?: string;
  CASHFREE_WEBHOOK_SECRET?: string;
  CASHFREE_ALLOW_UNSIGNED?: string;
  CASHFREE_ENV?: "sandbox" | "production";
}

export type Account = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: string;
  job_role: string;
  active: number;
  must_change_password: number;
};
