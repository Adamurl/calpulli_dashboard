import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const env = import.meta.env;
export const recoveryLink =
  new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
export const passwordRecovery =
  location.pathname === "/reset-password" || recoveryLink;
const config = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    key: z.string().trim().min(1),
  })
  .safeParse({
    url: env.VITE_SUPABASE_URL?.trim(),
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
export const supabase = config.success
  ? createClient(
      config.data.url,
      config.data.key,
      passwordRecovery
        ? {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              storageKey: "calpulli-password-recovery",
            },
          }
        : undefined,
    )
  : null;
export const demoEnabled = env.VITE_ENABLE_DEMO === "true";
