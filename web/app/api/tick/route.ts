import { tick } from "gsm-gate-access-layer";
import { NextRequest, NextResponse } from "next/server";

import { makeSystemContext } from "@/lib/context";

/**
 * Scheduled entry point for the invitation lifecycle (Vercel Cron → this
 * route, once a minute — see `vercel.json`). Thin trigger over the existing,
 * already-tested `tick()`: no business logic lives here.
 *
 * Vercel Cron invocations carry `Authorization: Bearer $CRON_SECRET`
 * automatically. In production a missing/mismatched secret is rejected; in
 * environments where `CRON_SECRET` is unset (local dev) the check is skipped
 * so `curl`/manual testing keeps working (see quickstart.md).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const ctx = makeSystemContext();
  const report = await tick(ctx, new Date());
  return NextResponse.json(report);
}
