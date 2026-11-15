import { NextResponse } from "next/server";

import { configuredModel, isProviderConfigured } from "@/lib/ai/provider";
import { createSupabaseAdminClient } from "@/lib/db/server";

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

/**
 * Has the schema the Instant path needs actually reached this database?
 * (004 T-3.5.)
 *
 * Migrations are files in the repo; whether they ran against the *production*
 * project is a different fact, and constitution R4 makes an unapplied migration
 * a P0 defect rather than an ops footnote. Nothing on the signed-out surface
 * touches these tables, so without this probe the answer only appears when a
 * founder's pack fails mid-run.
 *
 * Each entry asks the database for zero rows of one column, and the signal is
 * the error code rather than the data: `42P01` means the table is missing,
 * `42703` the column, `PGRST20x` that PostgREST cannot see the relation.
 *
 * It runs as the service role deliberately. An anonymous probe cannot tell
 * "this table does not exist" from "this table exists and RLS says no" — the
 * first pass reported `publish_jobs` as unknown for exactly that reason — and a
 * health check that cannot distinguish those is not worth deploying. Reading
 * the schema is the whole point and no row is ever fetched: `limit(0)` of one
 * column, and only present/missing per migration leaves the endpoint.
 */
const SCHEMA_PROBES = [
  { migration: "0009_analyze_strategy", table: "analyze_runs", column: "id" },
  { migration: "0011_publish", table: "publish_jobs", column: "id" },
  // product_facts is keyed by workspace_id and has no `id` column — one row per
  // workspace, by design. Probing `id` here reported 42703 and the first version
  // of this endpoint called that a missing table, which was wrong and alarming.
  { migration: "0016_growth_instant_facts", table: "product_facts", column: "workspace_id" },
  // 0016 also widens analyze_runs for the Instant run.
  { migration: "0016_growth_instant_facts:hurdles", table: "analyze_runs", column: "hurdles" },
  { migration: "0016_growth_instant_facts:goal", table: "analyze_runs", column: "goal" },
  { migration: "0017_growth_pack", table: "growth_packs", column: "angles" },
] as const;

/** The relation is not there at all. */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);
/** The relation is there and the column is not — which may be this file's bug. */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

async function probeSchema(): Promise<{
  applied: boolean;
  missingTables: string[];
  missingColumns: string[];
  unknown: string[];
}> {
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const unknown: string[] = [];

  try {
    const supabase = createSupabaseAdminClient();

    await Promise.all(
      SCHEMA_PROBES.map(async (probe) => {
        const { error } = await supabase.from(probe.table).select(probe.column).limit(0);
        if (!error) return;
        const code = error.code ?? "";
        // A missing table and a missing column are different claims and are
        // reported as such: "the migration never ran" is an emergency, while
        // "this file asked for a column that is not there" is as likely to be a
        // mistake in the probe. Collapsing them turned a wrong column name into
        // a false P0 once already.
        if (MISSING_TABLE_CODES.has(code)) missingTables.push(probe.table);
        else if (MISSING_COLUMN_CODES.has(code)) {
          missingColumns.push(`${probe.table}.${probe.column}`);
        }
        // Past RLS, a remaining error is a connection or configuration problem.
        // It says nothing about the schema, so it is reported as unknown rather
        // than quietly counted as applied.
        else unknown.push(`${probe.migration} (${code || "no code"})`);
      }),
    );
  } catch {
    return { applied: false, missingTables: [], missingColumns: [], unknown: ["probe failed"] };
  }

  return {
    applied:
      missingTables.length === 0 && missingColumns.length === 0 && unknown.length === 0,
    missingTables,
    missingColumns,
    unknown,
  };
}

export async function GET() {
  const aiConfigured = isProviderConfigured();
  const schema = await probeSchema();

  const body = {
    // An unapplied migration breaks the loop just as surely as a missing key,
    // so it counts against `ok`.
    ok: aiConfigured && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && schema.applied,
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
      // T-3.5: the schema the Instant path needs, as observed on this database.
      migrations: {
        applied: schema.applied,
        ...(schema.missingTables.length > 0 ? { missingTables: schema.missingTables } : {}),
        ...(schema.missingColumns.length > 0 ? { missingColumns: schema.missingColumns } : {}),
        ...(schema.unknown.length > 0 ? { unknown: schema.unknown } : {}),
      },
    },
    publish: {
      // Presence of credentials per connector (006). As everywhere else here,
      // these say a key is SET, never that the platform accepts it — and for
      // X in particular, a working key on a free tier still cannot post.
      linkedin: Boolean(
        process.env.LINKEDIN_CLIENT_ID &&
          process.env.LINKEDIN_CLIENT_SECRET &&
          process.env.LINKEDIN_API_VERSION,
      ),
      meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      x: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
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
