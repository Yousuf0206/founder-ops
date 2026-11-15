import { NextResponse } from "next/server";

import { configuredModel, isProviderConfigured } from "@/lib/ai/provider";

/**
 * GET /api/health — the configuration signal (004 T-5.2).
 *
 * Phase 0 of the recovery milestone kept asking a question nobody could answer
 * without signing in and burning a generation: *is this deployment actually
 * configured?* Constitution R4 makes that product work, so it gets an endpoint.
 *
 * What it reports, deliberately:
 *
 *   - booleans about *presence* of configuration, never values;
 *   - the model identifier, which is a public model name, not a credential;
 *   - nothing about the database contents, and no per-workspace state.
 *
 * It does NOT attempt a generation. A health check that spends money on every
 * poll is its own kind of defect, and "the key is present" is a different claim
 * from "the key works" — only a real run (T-0.4) proves the second, which is
 * why `ai.configured: true` here is necessary but not sufficient for SC-06.
 *
 * Unauthenticated on purpose: it is useless to an attacker (it discloses no
 * value and no tenant data) and useful to the owner with curl, which is exactly
 * the audience. Nothing is added here that would change that trade.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const aiConfigured = isProviderConfigured();

  const body = {
    ok: aiConfigured && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    ai: {
      configured: aiConfigured,
      provider: process.env.AI_PROVIDER ?? null,
      model: aiConfigured ? configuredModel() : null,
    },
    supabase: {
      configured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    publish: {
      // The single connector this milestone ships (plan Phase 4).
      linkedin: Boolean(
        process.env.LINKEDIN_CLIENT_ID &&
          process.env.LINKEDIN_CLIENT_SECRET &&
          process.env.LINKEDIN_API_VERSION,
      ),
      tokenSealing: Boolean(process.env.CONNECTOR_TOKEN_KEY),
      cron: Boolean(process.env.CRON_SECRET),
    },
    // Vercel sets this; locally it is absent. Lets the owner tell which build
    // answered without reading the dashboard.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
