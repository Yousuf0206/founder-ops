import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runAutoPublish } from "@/lib/publish/auto";
import { runDuePublishJobs } from "@/lib/publish/execute";

/**
 * GET /api/ops/cron/publish-due (002 T2.10) — the Vercel Cron target.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`. Anything else is refused,
 * and with no CRON_SECRET configured the route refuses everything rather than
 * running unauthenticated.
 *
 * B1 is open: Vercel Hobby runs cron at most once a day, so vercel.json ships a
 * daily schedule. On Pro, change it to every few minutes. Until then reviewers
 * can run due jobs by hand from /publish.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null, secret: string): boolean {
  const presented = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Auto rules first, so rule-approved drafts publish in this same tick.
  const auto = await runAutoPublish({ limit: 20 });
  const outcomes = await runDuePublishJobs({ limit: 20 });

  const count = (results: string[]) =>
    results.reduce<Record<string, number>>((counts, result) => {
      counts[result] = (counts[result] ?? 0) + 1;
      return counts;
    }, {});

  return NextResponse.json({
    auto: count(auto.map((outcome) => outcome.result)),
    due: { processed: outcomes.length, ...count(outcomes.map((outcome) => outcome.result)) },
  });
}
