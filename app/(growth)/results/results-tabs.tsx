"use client";

import { useState } from "react";

/**
 * The two in-page tabs on Results (constitution R2).
 *
 * R2 allows Results "at most two in-page tabs: Problems / Posts". Two is the
 * ceiling, not a starting point — a third tab here is the beginning of the
 * sidebar the subtraction milestone removed.
 *
 * Both panels are rendered on the server and passed in as children, so
 * switching tabs is instant and no data is fetched twice. The panels stay
 * mounted so an in-progress edit in a post survives a look at the problems.
 */

export type ResultsTab = "problems" | "posts";

export function ResultsTabs({
  defaultTab,
  postCount,
  problems,
  posts,
}: {
  defaultTab: ResultsTab;
  postCount: number;
  problems: React.ReactNode;
  posts: React.ReactNode;
}) {
  const [tab, setTab] = useState<ResultsTab>(defaultTab);

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Results" className="flex gap-1 border-b border-line">
        <Tab id="problems" current={tab} onSelect={setTab}>
          Problems
        </Tab>
        <Tab id="posts" current={tab} onSelect={setTab}>
          Posts{postCount > 0 && <span className="ml-1.5 text-muted">{postCount}</span>}
        </Tab>
      </div>

      <div
        role="tabpanel"
        id="panel-problems"
        aria-labelledby="tab-problems"
        hidden={tab !== "problems"}
      >
        {problems}
      </div>
      <div role="tabpanel" id="panel-posts" aria-labelledby="tab-posts" hidden={tab !== "posts"}>
        {posts}
      </div>
    </div>
  );
}

function Tab({
  id,
  current,
  onSelect,
  children,
}: {
  id: ResultsTab;
  current: ResultsTab;
  onSelect: (tab: ResultsTab) => void;
  children: React.ReactNode;
}) {
  const active = current === id;

  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={`-mb-px rounded-t-md px-4 py-2.5 text-sm font-medium ${
        active ? "border-b-2 border-accent text-ink" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
