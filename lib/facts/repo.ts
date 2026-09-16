import "server-only";

import { createSupabaseServerClient } from "@/lib/db/server";
import type { OpsSession } from "@/lib/auth/session";

/**
 * Product facts data access (T-A5, FR-GI-X-002).
 *
 * Auto-extracted product truth, seeded from the product's own public page so a
 * first run is not blocked on a manual claim form (Constitution I, amended
 * v3.0.0). One row per workspace: facts describe the product, and a second
 * analysis refines them rather than forking a rival set.
 *
 * Every query is scoped by workspace_id explicitly even though RLS scopes it
 * anyway — same belt-and-braces convention as lib/knowledge/repo.ts.
 */

export type ProductFactFeature = {
  feature: string;
  /** The page's own words, so generation can quote rather than paraphrase. */
  evidence: string;
};

export type ProductFacts = {
  workspace_id: string;
  product_name: string;
  tagline: string;
  features: ProductFactFeature[];
  primary_cta: string;
  pricing_signals: string[];
  unknowns: string[];
  source_url: string;
  source_analyze_run_id: string | null;
  /** null = extracted but never confirmed by a human. */
  confirmed_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductFactsInput = {
  product_name: string;
  tagline: string;
  features: ProductFactFeature[];
  primary_cta: string;
  pricing_signals: string[];
  unknowns: string[];
  source_url: string;
  source_analyze_run_id?: string | null;
};

export async function getProductFacts(workspaceId: string): Promise<ProductFacts | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_facts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProductFacts | null) ?? null;
}

/**
 * Writes the extraction result.
 *
 * `confirmed_at` is deliberately NOT set here: extraction never confirms
 * itself. It is set only when a human edits the facts at Advanced (T-D3), which
 * is what makes the "auto-extracted, unconfirmed" wording in the prompt honest.
 *
 * A re-analysis overwrites the extracted fields. It does NOT clear
 * `confirmed_at`, because a human's confirmation of this product survives
 * re-reading its page.
 */
export async function upsertExtractedFacts(
  session: OpsSession,
  input: ProductFactsInput,
): Promise<ProductFacts> {
  const supabase = await createSupabaseServerClient();
  const workspaceId = session.activeWorkspace.workspaceId;

  const { data, error } = await supabase
    .from("product_facts")
    .upsert(
      {
        workspace_id: workspaceId,
        product_name: input.product_name,
        tagline: input.tagline,
        features: input.features,
        primary_cta: input.primary_cta,
        pricing_signals: input.pricing_signals,
        unknowns: input.unknowns,
        source_url: input.source_url,
        source_analyze_run_id: input.source_analyze_run_id ?? null,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ProductFacts;
}
