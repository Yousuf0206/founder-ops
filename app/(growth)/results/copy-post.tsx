"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy — the primary success action on a post (constitution R7, FR-06).
 *
 * Publishing needs a connected account, an approval and a working connector;
 * copying needs none of those, which is why it and not Publish is what the
 * simple path ends on. A founder who can copy five posts out of here has had
 * the whole value of the product without configuring anything.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * a failure says so and offers the text to select by hand rather than
 * pretending it worked.
 */

/** What actually lands on the clipboard: the post as you would paste it. */
export function postText(post: {
  hook: string;
  script: string;
  cta: string;
  hashtags: string[];
}): string {
  return [post.hook, post.script, post.cta, post.hashtags.join(" ")]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function CopyPost({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={copy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        {state === "copied" ? "Copied" : "Copy post"}
      </button>
      {/* aria-live so the confirmation is announced, not only coloured in. */}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Post copied to clipboard" : ""}
      </span>
      {state === "failed" && (
        <p role="alert" className="text-xs text-amber-800">
          Your browser blocked the clipboard. Select the text above and copy it.
        </p>
      )}
    </div>
  );
}
