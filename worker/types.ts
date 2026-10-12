import type { Organisation } from "./durable-objects/organisation";

export interface Env {
  ASSETS: Fetcher;
  ORGANISATION: DurableObjectNamespace<Organisation>;
  BOOTSTRAP_ADMIN_SECRET?: string;
}

export type Account = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: string;
  active: number;
  must_change_password: number;
};
