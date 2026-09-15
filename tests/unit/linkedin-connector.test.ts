import { describe, expect, it } from "vitest";

import { ConnectorError } from "@/lib/connectors/errors";
import {
  exchangeLinkedInCode,
  fetchLinkedInIdentity,
  linkedInAuthorizationUrl,
} from "@/lib/connectors/linkedin/oauth";
import {
  composeCommentary,
  escapeLittleText,
  LINKEDIN_COMMENTARY_LIMIT,
  publishToLinkedIn,
} from "@/lib/connectors/linkedin/publish";

/** 002 T2.3–T2.4 — the LinkedIn client, with fetch mocked. No real calls. */

const env = {
  LINKEDIN_CLIENT_ID: "client-id",
  LINKEDIN_CLIENT_SECRET: "client-secret",
  LINKEDIN_API_VERSION: "202601",
};

const payload = {
  hook: "Study smarter (not longer)",
  script: "Spaced repetition beats cramming.",
  captions: [],
  titles: [],
  hashtags: ["#learning", "exams"],
  cta: "Try a free lesson",
  visual_plan: "",
};

function capture(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("commentary", () => {
  it("composes hook, body, CTA, and hashtags in reading order", () => {
    expect(composeCommentary(payload)).toBe(
      "Study smarter (not longer)\n\nSpaced repetition beats cramming.\n\nTry a free lesson\n\n#learning #exams",
    );
  });

  it("escapes little-text markup so the text posts exactly as approved", () => {
    expect(escapeLittleText("(hi) #tag @you [x] *b* _i_ ~s~ {c} <d> a|b \\")).toBe(
      "\\(hi\\) \\#tag \\@you \\[x\\] \\*b\\* \\_i\\_ \\~s\\~ \\{c\\} \\<d\\> a\\|b \\\\",
    );
  });
});

describe("publishToLinkedIn", () => {
  it("posts as the member and returns the receipt and permalink", async () => {
    const { calls, fetchImpl } = capture(
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } }),
    );

    const receipt = await publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, env);

    expect(receipt.externalId).toBe("urn:li:share:123");
    expect(receipt.permalink).toContain(encodeURIComponent("urn:li:share:123"));

    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["linkedin-version"]).toBe("202601");
    expect(headers.authorization).toBe("Bearer tok");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.author).toBe("urn:li:person:abc");
    expect(body.lifecycleState).toBe("PUBLISHED");
  });

  it("maps 401 to a revoked token", async () => {
    const { fetchImpl } = capture(new Response("", { status: 401 }));
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, env),
    ).rejects.toMatchObject({ kind: "token_revoked" });
  });

  it("maps 429 to rate limited", async () => {
    const { fetchImpl } = capture(new Response("", { status: 429 }));
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, env),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("treats a dropped connection as an unknown outcome, never a clean failure", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("socket hang up");
    }) as typeof fetch;
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, env),
    ).rejects.toMatchObject({ kind: "outcome_unknown" });
  });

  it("treats an accepted post with no id as an unknown outcome", async () => {
    const { fetchImpl } = capture(new Response(null, { status: 201 }));
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, env),
    ).rejects.toMatchObject({ kind: "outcome_unknown" });
  });

  it("refuses an over-long post instead of truncating it", async () => {
    const { calls, fetchImpl } = capture(new Response(null, { status: 201 }));
    const long = { ...payload, script: "x".repeat(LINKEDIN_COMMENTARY_LIMIT) };
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload: long }, fetchImpl, env),
    ).rejects.toMatchObject({ kind: "rejected" });
    expect(calls).toHaveLength(0);
  });

  it("refuses to run without an API version", async () => {
    const { fetchImpl } = capture(new Response(null, { status: 201 }));
    await expect(
      publishToLinkedIn({ accessToken: "tok", memberId: "abc", payload }, fetchImpl, {}),
    ).rejects.toBeInstanceOf(ConnectorError);
  });
});

describe("LinkedIn OAuth", () => {
  it("builds the authorization URL with state and member-posting scopes", () => {
    const url = new URL(linkedInAuthorizationUrl({ state: "s1", redirectUri: "https://app/cb" }, env));
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app/cb");
  });

  it("exchanges a code and computes the expiry", async () => {
    const { calls, fetchImpl } = capture(
      Response.json({ access_token: "tok", expires_in: 60, scope: "openid,profile,w_member_social" }),
    );
    const tokens = await exchangeLinkedInCode({ code: "c", redirectUri: "https://app/cb" }, fetchImpl, env, 0);

    expect(tokens.accessToken).toBe("tok");
    expect(tokens.expiresAt?.getTime()).toBe(60_000);
    expect(tokens.scopes).toEqual(["openid", "profile", "w_member_social"]);
    expect(String(calls[0]!.init!.body)).toContain("grant_type=authorization_code");
  });

  it("reads the member id from userinfo", async () => {
    const { fetchImpl } = capture(Response.json({ sub: "abc", name: "Ada" }));
    expect(await fetchLinkedInIdentity("tok", fetchImpl)).toEqual({
      externalAccountId: "abc",
      displayName: "Ada",
    });
  });
});
