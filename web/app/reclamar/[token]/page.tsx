import { claimInvitation } from "gsm-gate-access-layer";
import { redirect } from "next/navigation";

import { makeSystemContext } from "@/lib/context";
import { createSessionClient } from "@/lib/supabase";
import { LoginForm } from "../../login/login-form";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Este enlace no es válido.",
  expired: "Este enlace expiró. Pídele al administrador una nueva invitación.",
  already_used: "Este enlace ya fue usado.",
};

/**
 * Public claim landing page (specs/005-owner-onboarding) — added to
 * middleware.ts's PUBLIC_PATHS since its visitor has no session yet.
 *
 * No session: shows the existing magic-link login form, carrying the token
 * through via /auth/callback's `next` param so this same page re-renders
 * right after authentication succeeds.
 *
 * Session exists: claims immediately (service-role context — research.md's
 * documented exception, since the caller has no `perfiles` row yet for any
 * RLS scope helper to resolve) and redirects into the resident portal, or
 * shows one of three distinct rejection messages (contracts/owner-onboarding.md).
 */
export default async function Reclamar({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main>
        <LoginForm next={`/reclamar/${token}`} />
      </main>
    );
  }

  const result = await claimInvitation(makeSystemContext(), token, user.id);
  if ("error" in result) {
    return (
      <main>
        <div className="panel auth-panel">
          <h1>Enlace no disponible</h1>
          <p className="muted">{ERROR_MESSAGES[result.error]}</p>
        </div>
      </main>
    );
  }

  redirect("/");
}
