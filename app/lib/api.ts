export type Account = {
  id: string;
  email: string;
  displayName: string;
  role: "employee" | "manager" | "admin";
  jobRole: string;
  mustChangePassword: boolean;
  active: boolean;
};
export type RosterAccount = Account & { createdAt: number };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Unable to connect. Check your connection and try again.",
      0,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "Service unavailable. Please try again.",
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(data.error || "Request failed", response.status);
  return data as T;
}
