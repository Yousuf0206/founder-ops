/**
 * Starter claim set (T1.5).
 *
 *   npm run seed:claims -- --slug lumo
 *
 * IMPORTANT — what this does and does not seed.
 *
 * `forbidden_claims` is seeded with a conservative list of marketing promises
 * an education product must not make. These are safe to assert without knowing
 * the product, because they are prohibitions: getting them slightly too broad
 * costs a rewrite, while getting them too narrow costs a false promise to a
 * student's family.
 *
 * `approved_claims` is seeded EMPTY, deliberately. Approved claims are
 * statements of fact about Lumo Learn, and inventing them here would put
 * fabricated product facts into the one place the constitution designates as
 * the source of truth (principle II) — which every future prompt then treats
 * as verified. The owner must write these.
 *
 * Until approved claims exist, generation has a claim set but nothing positive
 * to say, which is the correct failure mode: bots that decline are recoverable,
 * bots that invent are not.
 *
 * Re-running is safe: it never overwrites a non-empty list.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const STARTER_FORBIDDEN = [
  "guaranteed admission",
  "guaranteed results",
  "guaranteed grades",
  "guaranteed rank",
  "guaranteed score improvement",
  "100% success rate",
  "100% pass rate",
  "#1 in Pakistan",
  "best in Pakistan",
  "the only platform that",
  "replaces your teacher",
  "no studying required",
  "instant results",
  "accredited by",
  "endorsed by the government",
  "approved by the board",
];

const STARTER_BRAND_VOICE = [
  "Plain, warm, and concrete. Write to a student or a parent, not to an investor.",
  "Prefer specifics over superlatives: what the product does, not how great it is.",
  "Never imply an outcome the product cannot control — effort, results, and admission",
  "decisions belong to the student and their institution.",
  "If a fact is not in the knowledge base, say it is unknown rather than estimating.",
].join(" ");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const slugIndex = argv.indexOf("--slug");
  const slug = slugIndex >= 0 ? argv[slugIndex + 1] : undefined;

  if (!slug) {
    console.error("Usage: npm run seed:claims -- --slug lumo");
    process.exit(1);
  }

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace) {
    console.error(`No workspace with slug "${slug}". Run seed:workspace first.`);
    process.exit(1);
  }

  const { data: existing, error: existingError } = await admin
    .from("claim_sets")
    .select("workspace_id, approved_claims, forbidden_claims, brand_voice")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (existingError) throw existingError;

  // Never clobber real content. Only fill what is empty.
  const forbidden =
    existing && existing.forbidden_claims.length > 0
      ? existing.forbidden_claims
      : STARTER_FORBIDDEN;

  const brandVoice =
    existing && existing.brand_voice.trim().length > 0
      ? existing.brand_voice
      : STARTER_BRAND_VOICE;

  const approved = existing?.approved_claims ?? [];

  const { error } = await admin.from("claim_sets").upsert(
    {
      workspace_id: workspace.id,
      approved_claims: approved,
      forbidden_claims: forbidden,
      brand_voice: brandVoice,
    },
    { onConflict: "workspace_id" },
  );

  if (error) throw error;

  console.log(
    `Claim set ready for "${workspace.name}".\n` +
      `  forbidden claims: ${forbidden.length}\n` +
      `  brand voice:      ${brandVoice.trim() ? "set" : "empty"}\n` +
      `  approved claims:  ${approved.length}\n`,
  );

  if (approved.length === 0) {
    console.log(
      "Approved claims are empty by design — they are product facts and must be\n" +
        "written by someone who knows them. Add them at /knowledge/claims before\n" +
        "running any generation.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
