import Link from "next/link";
import { notFound } from "next/navigation";

import { canWrite } from "@/lib/auth/session";
import { getDoc, requireSession } from "@/lib/knowledge/repo";
import { deleteDocAction, updateDocAction } from "../actions";
import { DocForm } from "../doc-form";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  const doc = await getDoc(session.activeWorkspace.workspaceId, id);
  if (!doc) notFound();

  const writer = canWrite(session.activeWorkspace.role);

  return (
    <div className="max-w-2xl">
      <Link href="/knowledge" className="text-sm text-[--color-muted]">
        ← Knowledge
      </Link>

      {writer ? (
        <>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Edit document</h1>
          <DocForm action={updateDocAction} doc={doc} submitLabel="Save changes" />

          <form action={deleteDocAction} className="mt-10 border-t border-[--color-line] pt-4">
            <input type="hidden" name="id" value={doc.id} />
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Delete this document
            </button>
          </form>
        </>
      ) : (
        <ReadOnlyDoc doc={doc} />
      )}
    </div>
  );
}

/** Viewers get the content, not the form. The DB would reject their write
 *  anyway (T1.7), but showing an editor that cannot save is a bad UI. */
function ReadOnlyDoc({
  doc,
}: {
  doc: NonNullable<Awaited<ReturnType<typeof getDoc>>>;
}) {
  return (
    <article className="mt-2">
      <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-1 text-sm text-[--color-muted]">
        {doc.category}
        {" · "}
        {doc.last_verified_at
          ? `verified ${new Date(doc.last_verified_at).toLocaleDateString()}`
          : "never verified"}
      </p>
      <div className="mt-6 whitespace-pre-wrap rounded-lg border border-[--color-line] bg-[--color-surface] p-4 text-sm">
        {doc.body || <span className="text-[--color-muted]">(empty)</span>}
      </div>
      <p className="mt-4 text-xs text-[--color-muted]">
        You have viewer access, so this document is read-only.
      </p>
    </article>
  );
}
