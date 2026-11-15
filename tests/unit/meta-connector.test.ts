import { describe, expect, it } from "vitest";

import { ConnectorError } from "@/lib/connectors/errors";
import { metaAuthorizationUrl, fetchMetaConnection, META_SCOPES } from "@/lib/connectors/meta/oauth";
import {
  composeMetaBody,
  publishToFacebookPage,
  publishToInstagram,
  InstagramMediaRequiredError,
  INSTAGRAM_CAPTION_LIMIT,
} from "@/lib/connectors/meta/publish";
import type { ContentPayload } from "@/lib/ai/content";

/**
 * The Meta connector (006).
 *
 * Two platforms behind one login, and the tests that matter are the ones about
 * what cannot happen: an Instagram post without an image must be refused with a
 * sentence a founder can act on rather than attempted and failed at the
 * platform, and a Page token must never be swapped for the user token that
 * created it.
 *
 * Everything here runs against a stub fetch. The point is the mapping — our
 * request shape, and Meta's answers turned into the connector error taxonomy —
 * not Meta's behaviour, which no unit test can assert.
 */

const payload: ContentPayload = {
  hook: "Study smarter",
  script: "Spaced repetition beats cramming.",
  captions: [],
  titles: [],
  hashtags: ["#learning"],
  cta: "Try a free lesson",
  visual_plan: "",
  image_url: "",
};

function stub(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; body: string }[] = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(next!.body), {
      status: next!.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("the Meta authorization URL", () => {
  it("asks for exactly the scopes the connector uses", () => {
    const url = new URL(
      metaAuthorizationUrl(
        { state: "abc", redirectUri: "https://app.example/callback" },
        { META_APP_ID: "123", META_APP_SECRET: "shh" },
      ),
    );

    expect(url.searchParams.get("scope")?.split(",")).toEqual([...META_SCOPES]);
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("refuses to build one when the app is not configured", () => {
    expect(() => metaAuthorizationUrl({ state: "a", redirectUri: "b" }, {})).toThrow(ConnectorError);
  });
});

describe("choosing what to connect", () => {
  const page = {
    id: "page-1",
    name: "Lumo",
    access_token: "page-token",
    instagram_business_account: { id: "ig-1", username: "lumo" },
  };

  it("keeps the Page and its own token for Facebook", async () => {
    const { fetchImpl } = stub([{ body: { data: [page] } }]);
    const connection = await fetchMetaConnection(
      { userToken: "user-token", platform: "facebook", expiresAt: null },
      fetchImpl,
    );

    expect(connection.externalAccountId).toBe("page-1");
    // The Page token, never the user token that produced it.
    expect(connection.accessToken).toBe("page-token");
  });

  it("keeps the Instagram account id, still on the Page token", async () => {
    const { fetchImpl } = stub([{ body: { data: [page] } }]);
    const connection = await fetchMetaConnection(
      { userToken: "user-token", platform: "instagram", expiresAt: null },
      fetchImpl,
    );

    expect(connection.externalAccountId).toBe("ig-1");
    expect(connection.displayName).toBe("@lumo");
    expect(connection.accessToken).toBe("page-token");
  });

  it("says what to do when the Page has no Instagram account linked", async () => {
    const { fetchImpl } = stub([{ body: { data: [{ ...page, instagram_business_account: undefined }] } }]);

    await expect(
      fetchMetaConnection({ userToken: "t", platform: "instagram", expiresAt: null }, fetchImpl),
    ).rejects.toThrow(/no Instagram professional account linked/i);
  });

  it("says what to do when the person manages no Pages at all", async () => {
    const { fetchImpl } = stub([{ body: { data: [] } }]);

    await expect(
      fetchMetaConnection({ userToken: "t", platform: "facebook", expiresAt: null }, fetchImpl),
    ).rejects.toThrow(/manages no Pages/i);
  });

  it("reads a dead token as token_revoked, not as a refusal", async () => {
    const { fetchImpl } = stub([{ status: 400, body: { error: { message: "expired", code: 190 } } }]);

    await expect(
      fetchMetaConnection({ userToken: "t", platform: "facebook", expiresAt: null }, fetchImpl),
    ).rejects.toMatchObject({ kind: "token_revoked" });
  });
});

describe("publishing to a Facebook Page", () => {
  it("posts the approved body to the Page feed and returns a receipt", async () => {
    const { calls, fetchImpl } = stub([{ body: { id: "page-1_9" } }]);
    const receipt = await publishToFacebookPage(
      { accessToken: "page-token", pageId: "page-1", payload },
      fetchImpl,
    );

    expect(calls[0]?.url).toContain("/page-1/feed");
    expect(new URLSearchParams(calls[0]!.body).get("message")).toBe(composeMetaBody(payload));
    expect(receipt.permalink).toContain("page-1_9");
  });

  it("posts a photo instead when the post carries an image", async () => {
    const { calls, fetchImpl } = stub([{ body: { post_id: "page-1_10", id: "photo-1" } }]);
    const receipt = await publishToFacebookPage(
      { accessToken: "t", pageId: "page-1", payload: { ...payload, image_url: "https://img/x.jpg" } },
      fetchImpl,
    );

    expect(calls[0]?.url).toContain("/page-1/photos");
    // The POST id, not the photo id: the post is what a receipt points at.
    expect(receipt.externalId).toBe("page-1_10");
  });

  it("treats a lost connection as outcome_unknown, never as a clean failure", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    await expect(
      publishToFacebookPage({ accessToken: "t", pageId: "p", payload }, fetchImpl),
    ).rejects.toMatchObject({ kind: "outcome_unknown" });
  });
});

describe("publishing to Instagram", () => {
  it("refuses a caption with no image, before any call is made", async () => {
    const { calls, fetchImpl } = stub([{ body: {} }]);

    await expect(
      publishToInstagram({ accessToken: "t", igUserId: "ig-1", payload }, fetchImpl),
    ).rejects.toBeInstanceOf(InstagramMediaRequiredError);
    expect(calls).toHaveLength(0);
  });

  it("creates a container and then publishes it", async () => {
    const { calls, fetchImpl } = stub([{ body: { id: "container-1" } }, { body: { id: "media-1" } }]);
    const receipt = await publishToInstagram(
      { accessToken: "t", igUserId: "ig-1", payload: { ...payload, image_url: "https://img/x.jpg" } },
      fetchImpl,
    );

    expect(calls[0]?.url).toContain("/ig-1/media");
    expect(calls[1]?.url).toContain("/ig-1/media_publish");
    expect(new URLSearchParams(calls[1]!.body).get("creation_id")).toBe("container-1");
    expect(receipt.externalId).toBe("media-1");
  });

  it("refuses an over-long caption rather than letting Instagram cut it", async () => {
    const { fetchImpl } = stub([{ body: {} }]);

    await expect(
      publishToInstagram(
        {
          accessToken: "t",
          igUserId: "ig-1",
          payload: {
            ...payload,
            image_url: "https://img/x.jpg",
            script: "x".repeat(INSTAGRAM_CAPTION_LIMIT + 1),
          },
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/Instagram allows/);
  });
});
