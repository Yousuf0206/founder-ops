import Link from "next/link";
import { redirect } from "next/navigation";

import { canWrite } from "@/lib/auth/session";
import { requireSession } from "@/lib/knowledge/repo";
import { createDocAction } from "../actions";
import { DocForm } from "../doc-form";

export default async function NewDocPage() {
  const session = await requireSession();
  if (!canWrite(session.activeWorkspace.role)) redirect("/knowledge");

  return (
    <div className="max-w-2xl">
      <Link href="/knowledge" className="text-sm text-muted">
        ← Knowledge
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">New document</h1>
      <DocForm action={createDocAction} submitLabel="Create document" />
    </div>
  );
}
