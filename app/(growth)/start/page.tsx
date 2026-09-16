import { StartForm } from "./start-form";

/**
 * Start — destination 1 of 5 (FR-GI-S-001..004).
 *
 * Deliberately has no workspace picker, no claim prompt, and no setup checklist:
 * a signed-in user sees one field. Everything else happens underneath them.
 */

export const metadata = {
  title: "Start — Lumo Grow",
};

export default function StartPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Paste your product link
      </h1>
      <p className="mt-2 text-base text-muted">
        We&rsquo;ll read your public page, show you what&rsquo;s holding growth back, and
        write content you can publish.
      </p>

      <StartForm />
    </div>
  );
}
