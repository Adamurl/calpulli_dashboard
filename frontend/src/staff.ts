import type { User } from "@supabase/supabase-js";

export function staffDisplayName(
  user: Pick<User, "email" | "user_metadata">,
): string {
  const username = user.email?.split("@")[0] ?? "";
  if (username.toLowerCase() === "adamurlnum2") return "Adam Gonzales";
  const profile = user.user_metadata;
  for (const key of ["full_name", "name", "display_name"]) {
    const value: unknown = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const parts = [profile.first_name, profile.last_name].filter(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  if (parts.length) return parts.map((value) => value.trim()).join(" ");
  return (
    username
      .replace(/[._-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Staff"
  );
}
