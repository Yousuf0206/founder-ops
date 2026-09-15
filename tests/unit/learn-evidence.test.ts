import { describe, expect, it } from "vitest";

import { keepCited, learnOutputSchema, validateLearnOutput } from "@/lib/learn/evidence";

/** 002 T4.4–T4.5 — FR-LRN-003: everything in a learn report is tied to real published posts. */

const known = new Set(["job-1", "job-2"]);

describe("keepCited", () => {
  it("keeps an item citing a known post", () => {
    expect(keepCited([{ finding: "x", evidence_job_ids: ["job-1"] }], known)).toHaveLength(1);
  });

  it("drops an item citing only unknown posts", () => {
    expect(keepCited([{ finding: "x", evidence_job_ids: ["job-9"] }], known)).toHaveLength(0);
  });

  it("drops an item with no citation", () => {
    expect(keepCited([{ finding: "x", evidence_job_ids: [] }], known)).toHaveLength(0);
  });

  it("strips unknown and duplicate citations from an item that also cites a real post", () => {
    const [item] = keepCited([{ finding: "x", evidence_job_ids: ["job-1", "job-9", "job-1"] }], known);
    expect(item!.evidence_job_ids).toEqual(["job-1"]);
  });
});

describe("validateLearnOutput", () => {
  it("filters every section, including knowledge proposals", () => {
    const output = learnOutputSchema.parse({
      what_worked: [{ finding: "Short hooks did well", evidence_job_ids: ["job-1"] }],
      suggested_topics: [{ topic: "Exam week tips", evidence_job_ids: ["made-up"] }],
      knowledge_proposals: [
        { kind: "approved_claim_add", text: "Free tier available", evidence_job_ids: ["job-2"] },
        { kind: "forbidden_claim_add", text: "fastest app", evidence_job_ids: [] },
      ],
    });

    const valid = validateLearnOutput(output, known);
    expect(valid.what_worked).toHaveLength(1);
    expect(valid.suggested_topics).toHaveLength(0);
    expect(valid.knowledge_proposals.map((p) => p.text)).toEqual(["Free tier available"]);
  });

  it("rejects an unknown proposal kind at parse time", () => {
    expect(
      learnOutputSchema.safeParse({ knowledge_proposals: [{ kind: "delete_claim", text: "x" }] }).success,
    ).toBe(false);
  });
});
