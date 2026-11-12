import { supabase } from "./auth";

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 401
        ? "Your session has expired. Please log in again."
        : status === 403
          ? "Your account does not have staff access. Contact an administrator."
          : "Unable to verify workspace access. Please try again.",
    );
  }
}

export async function apiFetch(
  path: `/api/v1/${string}`,
  options: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/api/v1/")
  ) {
    throw new Error("Invalid API path");
  }
  if (!supabase) throw new ApiError(401);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiError(401);
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  const response = await fetch(url, {
    ...options,
    headers,
    mode: "same-origin",
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}
