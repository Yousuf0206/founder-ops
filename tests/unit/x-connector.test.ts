import { describe, expect, it } from "vitest";

import { createPkcePair } from "@/lib/connectors/oauth-state";
import { exchangeXCode, xAuthorizationUrl, X_SCOPES } from "@/lib/connectors/x/oauth";
import { composeXPost, publishToX, X_POST_LIMIT } from "@/lib/connectors/x/publish";
import type { ContentPayload } from "@/lib/ai/content";

/**
 * The X connector (006).
 *
 * Two things here are easy to get wrong and expensive in production: the PKCE
 * verifier must never travel with the authorization request, and a post must
 * never be cut mid-sentence to fit 280 characters — the text that goes out has
 * to be text a human approved, or approval means nothing.
 */

const payload: ContentPayload = {
  hook: "Study smarter",
  script: "Spaced repetition beats cramming, and it takes ten minutes a day.",
  captions: [],
  titles: [],
  hashtags: ["#learning"],
  cta: "Try a free lesson",
  visual_plan: "",
  image_url: "",
  video_url: "",
};

const env = { X_CLIENT_ID: "client", X_CLIENT_SECRET: "secret" };

function stub(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("the X authorization URL", () => {
  const { verifier, challenge } = createPkcePair();

  it("sends the challenge and never the verifier", () => {
    const url = new URL(
      xAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb", challenge }, env),
    );

    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain(verifier);
  });

  it("asks for offline.access, without which the connection dies in two hours", () => {
    const url = new URL(xAuthorizationUrl({ state: "a", redirectUri: "b", challenge }, env));

    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...X_SCOPES]);
  });
});

describe("exchanging the code", () => {
  it("authenticates with Basic and sends the verifier", async () => {
    const { calls, fetchImpl } = stub(200, {
      access_token: "at",
      refresh_token: "rt",
      expires_in: 7200,
      scope: "tweet.write",
    });

    const tokens = await exchangeXCode(
      { code: "code", redirectUri: "https://app.example/cb", verifier: "v" },
      fetchImpl,
      env,
      0,
    );

    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from("client:secret").toString("base64")}`);
    expect(String(calls[0]?.init?.body)).toContain("code_verifier=v");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.expiresAt?.getTime()).toBe(7_200_000);
  });

  it("reports a refusal with the reason X gave", async () => {
    const { fetchImpl } = stub(400, { error_description: "invalid verifier" });

    await expect(
      exchangeXCode({ code: "c", redirectUri: "r", verifier: "v" }, fetchImpl, env),
    ).rejects.toThrow(/invalid verifier/);
  });
});

describe("composing one post", () => {
  it("keeps body, CTA and hashtags when they fit", () => {
    expect(composeXPost(payload)).toBe(
      "Spaced repetition beats cramming, and it takes ten minutes a day.\n\nTry a free lesson\n\n#learning",
    );
  });

  it("drops whole parts rather than cutting a sentence in half", () => {
    const long = "x".repeat(X_POST_LIMIT - 10);
    const text = composeXPost({ ...payload, script: long });

    expect(text).toBe(long);
    expect(text.length).toBeLessThanOrEqual(X_POST_LIMIT);
    expect(text).not.toContain("Try a free lesson");
  });

  it("falls back to the hook when there is no body", () => {
    expect(composeXPost({ ...payload, script: "", cta: "", hashtags: [] })).toBe("Study smarter");
  });
});

describe("publishing", () => {
  it("posts the text and returns a receipt", async () => {
    const { calls, fetchImpl } = stub(201, { data: { id: "9" } });
    const receipt = await publishToX({ accessToken: "at", payload }, fetchImpl);

    expect(JSON.parse(String(calls[0]?.init?.body)).text).toBe(composeXPost(payload));
    expect(receipt.permalink).toBe("https://x.com/i/web/status/9");
  });

  it("explains a 403 as the paid-tier problem it almost always is", async () => {
    const { fetchImpl } = stub(403, { detail: "not permitted" });

    await expect(publishToX({ accessToken: "at", payload }, fetchImpl)).rejects.toThrow(
      /paid X API tier/,
    );
  });

  it("maps a dead token to token_revoked so the account gets marked", async () => {
    const { fetchImpl } = stub(401, { detail: "unauthorized" });

    await expect(publishToX({ accessToken: "at", payload }, fetchImpl)).rejects.toMatchObject({
      kind: "token_revoked",
    });
  });

  it("treats a lost connection as outcome_unknown", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    await expect(publishToX({ accessToken: "at", payload }, fetchImpl)).rejects.toMatchObject({
      kind: "outcome_unknown",
    });
  });

  it("refuses an empty body instead of posting nothing", async () => {
    const { fetchImpl } = stub(201, { data: { id: "9" } });

    await expect(
      publishToX(
        { accessToken: "at", payload: { ...payload, script: "", hook: "", cta: "", hashtags: [] } },
        fetchImpl,
      ),
    ).rejects.toThrow(/empty/);
  });
});
