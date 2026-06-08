import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Session-scoped client for server components and server actions.
 * Reads/writes the auth session from the request cookies.
 * RLS enforced — this client sees only what the authenticated user can see.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => {
        try {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component context — cookies set via middleware instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS.
 * Use for: admin seed, scheduler (tick worker), inbound webhook.
 */
export function createServiceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
