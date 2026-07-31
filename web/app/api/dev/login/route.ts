import { NextRequest, NextResponse } from "next/server";

import { createServiceClient, createSessionClient } from "@/lib/supabase";

/**
 * TEMPORARY dev/testing shortcut: establishes a real session for an existing
 * resident's email without sending/clicking a magic-link email. Guarded by
 * CRON_SECRET (reused, not a new secret) so it isn't a public backdoor.
 *
 * Delete this route once magic-link email delivery is validated end-to-end —
 * it exists only to unblock manual testing while diagnosing the auth flow.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided = request.nextUrl.searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    return NextResponse.json(
      { error: error?.message ?? "No hashed_token returned" },
      { status: 500 },
    );
  }

  const sessionClient = await createSessionClient();
  const { error: verifyError } = await sessionClient.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/", request.url));
}
