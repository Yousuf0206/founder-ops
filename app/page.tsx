import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * The front door (P1; spec 003 UX Principle 4, SC-01).
 *
 * `/` used to be the v2 ops console, whose first and loudest instruction was
 * "Add approved claims — nothing generates or publishes without them." That is
 * the exact wall Growth Instant removed: a founder who has just signed up is
 * asked to do knowledge-base homework before seeing a single result, and the
 * sentence is no longer even true (auto-extracted product facts bind a first
 * run — see lib/prompts/assemble.ts).
 *
 * So `/` is now a router, not a screen. It holds no content of its own, which
 * means there is no second home page to keep in step with Start, and the ops
 * console is still there in full at /advanced for anyone who wants it.
 *
 * Signed out, it sends people through login and back to Start rather than to a
 * marketing page: auth precedes Start by decision, and `safeNextPath` defaults
 * to "/", so an ordinary sign-in with no `next` also arrives here and is
 * forwarded on. Workspace selection and creation happen underneath Start
 * itself (FR-GI-S-003), so there is nothing to resolve here first.
 */
export default async function RootPage() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseConfigured) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/start");

  redirect("/start");
}
