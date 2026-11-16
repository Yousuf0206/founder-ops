import { describe, expect, it } from "vitest";

import { ConnectorError } from "@/lib/connectors/errors";
import {
  exchangeTikTokCode,
  refreshTikTokToken,
  tikTokAuthorizationUrl,
  TIKTOK_SCOPES,
} from "@/lib/connectors/tiktok/oauth";
import {
  composeTikTokBody,
  composeTikTokPhotoTitle,
  publishToTikTok,
  TikTokMediaRequiredError,
  TIKTOK_PHOTO_TITLE_LIMIT,
} from "@/lib/connectors/tiktok/publish";
import type { ContentPayload } from "@/lib/ai/content";

/**
 * The TikTok connector (007).
 *
 * The tests that matter here are the ones about what cannot happen: a post with
 * no media must make zero network calls, a post with a video must not be
 * published as a photo, and the privacy level must come from the creator's own
 * options rather than from a hopeful constant.
 *
 * Everything runs against a stub fetch. The point is the mapping — our request
 * shape, and TikTok's answers turned into the connector error taxonomy — not
 * TikTok's behaviour, which no unit test can assert.
 */

const env = { TIKTOK_CLIENT_KEY: "key-123", TIKTOK_CLIENT_SECRET: "shh" };

const payload: ContentPayload = {
  hook: "Study smarter",
  script: "Spaced repetition beats cramming.",
  captions: [],
  titles: [],
  hashtags: ["#learning"],
  cta: "Try a free lesson",
  visual_plan: "",
  image_url: "",
  video_url: "",
};

/** No waiting in tests: the bounded status poll is driven by an injected sleep. */
const noSleep = async () => {};

function stub(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; body: string; method: string }[] = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: String(init?.body ?? ""),
      method: init?.method ?? "GET",
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(next!.body), {
      status: next!.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/**
 * The ConnectorError a call refused with.
 *
 * A plain `.catch()` would widen the type to "error or receipt" and hide a
 * success as a type error elsewhere, so this asserts the refusal happened and
 * hands back the error itself.
 */
async function refusal(promise: Promise<unknown>): Promise<ConnectorError> {
  let caught: unknown;
  let resolved = false;
  try {
    await promise;
    resolved = true;
  } catch (error) {
    caught = error;
  }
  if (resolved) throw new Error("expected the call to be refused, but it succeeded");
  expect(caught).toBeInstanceOf(ConnectorError);
  return caught as ConnectorError;
}

/** The creator-info answer every publish starts with. */
const creatorInfo = {
  body: {
    data: { creator_username: "lumo", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] },
    error: { code: "ok" },
  },
};

describe("the TikTok authorization URL", () => {
  it("uses client_key, which is TikTok's name for it and not client_id", () => {
    const url = new URL(
      tikTokAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb" }, env),
    );

    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("key-123");
    expect(url.searchParams.get("client_id")).toBeNull();
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("asks for exactly the scopes the connector uses, comma-separated", () => {
    const url = new URL(
      tikTokAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb" }, env),
    );

    expect(url.searchParams.get("scope")).toBe(TIKTOK_SCOPES.join(","));
    expect(TIKTOK_SCOPES).toContain("video.publish");
  });

  /**
   * TikTok's web flow does not use PKCE — its own docs apply that to desktop
   * and mobile — and sending a challenge it does not expect is a way to be
   * refused for no reason. The signed state cookie is the CSRF defence.
   */
  it("sends no PKCE challenge, which the web flow does not use", () => {
    const url = new URL(
      tikTokAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb" }, env),
    );

    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("refuses to build a URL when the app is not configured", () => {
    expect(() => tikTokAuthorizationUrl({ state: "a", redirectUri: "b" }, {})).toThrowError(
      /not configured/i,
    );
  });
});

describe("exchanging a TikTok code", () => {
  it("keeps open_id, which is the account publishing identifies by", async () => {
    const { calls, fetchImpl } = stub([
      {
        body: {
          access_token: "at",
          refresh_token: "rt",
          expires_in: 7_200,
          refresh_expires_in: 15_552_000,
          open_id: "open-1",
          scope: "user.info.basic,video.publish",
        },
      },
    ]);

    const tokens = await exchangeTikTokCode(
      { code: "code-1", redirectUri: "https://app.example/cb" },
      fetchImpl,
      env,
      1_000,
    );

    expect(tokens.openId).toBe("open-1");
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.expiresAt?.getTime()).toBe(1_000 + 7_200_000);
    // TikTok returns scopes comma-separated; a space-splitter would read them
    // as one scope and the stored row would be wrong.
    expect(tokens.scopes).toEqual(["user.info.basic", "video.publish"]);
    expect(calls[0]!.body).toContain("client_key=key-123");
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
  });

  it("refuses a token with no account id, because there would be nothing to publish to", async () => {
    const { fetchImpl } = stub([{ body: { access_token: "at", expires_in: 7_200 } }]);

    await expect(
      exchangeTikTokCode({ code: "c", redirectUri: "r" }, fetchImpl, env),
    ).rejects.toThrowError(/without an account id/i);
  });
});

describe("refreshing a TikTok token", () => {
  /**
   * The rotation is the whole point. TikTok invalidates the old refresh token
   * the instant this succeeds, so a caller that does not store the new one has
   * a dead connection and a founder being told to reconnect a healthy account.
   */
  it("returns the rotated refresh token, which the caller must store", async () => {
    const { calls, fetchImpl } = stub([
      { body: { access_token: "at2", refresh_token: "rt2", expires_in: 7_200, open_id: "open-1" } },
    ]);

    const tokens = await refreshTikTokToken("rt1", fetchImpl, env);

    expect(tokens.accessToken).toBe("at2");
    expect(tokens.refreshToken).toBe("rt2");
    expect(calls[0]!.body).toContain("grant_type=refresh_token");
    expect(calls[0]!.body).toContain("refresh_token=rt1");
  });

  it("reports a refused refresh as a revoked connection, not as a rejection", async () => {
    const { fetchImpl } = stub([
      { status: 400, body: { error: "invalid_grant", error_description: "expired" } },
    ]);

    await expect(refreshTikTokToken("rt1", fetchImpl, env)).rejects.toMatchObject({
      kind: "token_revoked",
    });
  });
});

describe("composing a TikTok post", () => {
  it("keeps the approved parts in reading order", () => {
    expect(composeTikTokBody(payload)).toBe(
      "Study smarter\n\nSpaced repetition beats cramming.\n\nTry a free lesson\n\n#learning",
    );
  });

  it("adds the hash a model left off a hashtag", () => {
    expect(composeTikTokBody({ ...payload, hashtags: ["learning"] })).toContain("#learning");
  });

  /**
   * A photo title is capped at 90, and a title cut mid-word is not text a human
   * approved — the rule composeXPost follows. So a long hook yields to a
   * sentence that fits rather than being truncated.
   */
  it("never truncates the photo title: it picks something that fits", () => {
    const long = "x".repeat(200);

    // A whole part that fits is preferred to a sentence out of it.
    expect(
      composeTikTokPhotoTitle({
        ...payload,
        hook: long,
        script: "Short enough. And more text after.",
      }),
    ).toBe("Short enough. And more text after.");

    // When no whole part fits, the first sentence that does is used — and it is
    // a whole sentence, never a cut one.
    const title = composeTikTokPhotoTitle({
      ...payload,
      hook: long,
      script: `Short enough. ${long}`,
    });

    expect(title.length).toBeLessThanOrEqual(TIKTOK_PHOTO_TITLE_LIMIT);
    expect(title).toBe("Short enough.");
  });

  it("returns nothing rather than a fragment when nothing fits", () => {
    const long = "x".repeat(200);
    expect(composeTikTokPhotoTitle({ ...payload, hook: long, script: long, cta: long })).toBe("");
  });
});

describe("publishing to TikTok", () => {
  /**
   * The most important test in this file: a post TikTok is certain to refuse
   * must cost zero API calls, because the founder can fix it and a platform
   * error cannot be fixed by anyone.
   */
  it("refuses a post with no media before making any network call", async () => {
    const { calls, fetchImpl } = stub([{ body: {} }]);

    await expect(
      publishToTikTok({ accessToken: "at", openId: "open-1", payload }, fetchImpl),
    ).rejects.toBeInstanceOf(TikTokMediaRequiredError);

    expect(calls).toHaveLength(0);
  });

  it("publishes a video to the video endpoint, pulled from its URL", async () => {
    const { calls, fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v_pub_url~v2.1" }, error: { code: "ok" } } },
      {
        body: {
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7777"] },
          error: { code: "ok" },
        },
      },
    ]);

    const receipt = await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep },
    );

    expect(calls[1]!.url).toContain("/post/publish/video/init/");
    const sent = JSON.parse(calls[1]!.body);
    expect(sent.source_info).toEqual({ source: "PULL_FROM_URL", video_url: "https://cdn/x.mp4" });
    expect(receipt.externalId).toBe("7777");
    expect(receipt.permalink).toBe("https://www.tiktok.com/@lumo/video/7777");
  });

  /**
   * A post with both is a video post. Quietly publishing it as a photo would
   * send something other than what was approved.
   */
  it("prefers the video when a post carries both", async () => {
    const { calls, fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v1" }, error: { code: "ok" } } },
      { body: { data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok" } } },
    ]);

    await publishToTikTok(
      {
        accessToken: "at",
        openId: "open-1",
        payload: { ...payload, video_url: "https://cdn/x.mp4", image_url: "https://cdn/x.jpg" },
      },
      fetchImpl,
      { sleep: noSleep, attempts: 1 },
    );

    expect(calls[1]!.url).toContain("/video/init/");
    expect(calls[1]!.url).not.toContain("/content/init/");
  });

  it("publishes an image as a photo post, with the words in the description", async () => {
    const { calls, fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "p_pub_url~v2.1" }, error: { code: "ok" } } },
      { body: { data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok" } } },
    ]);

    await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, image_url: "https://cdn/x.jpg" } },
      fetchImpl,
      { sleep: noSleep, attempts: 1 },
    );

    expect(calls[1]!.url).toContain("/post/publish/content/init/");
    const sent = JSON.parse(calls[1]!.body);
    expect(sent.media_type).toBe("PHOTO");
    expect(sent.post_mode).toBe("DIRECT_POST");
    expect(sent.source_info.photo_images).toEqual(["https://cdn/x.jpg"]);
    expect(sent.post_info.description).toBe(composeTikTokBody(payload));
    expect(sent.post_info.title.length).toBeLessThanOrEqual(TIKTOK_PHOTO_TITLE_LIMIT);
  });

  /**
   * `privacy_level` is required and must be one of the creator's own options.
   * Sending a value they cannot use is a documented 403 that reads to a founder
   * as "TikTok is broken".
   */
  it("sends the most public privacy level the creator actually allows", async () => {
    const { calls, fetchImpl } = stub([
      {
        body: {
          data: { creator_username: "lumo", privacy_level_options: ["SELF_ONLY"] },
          error: { code: "ok" },
        },
      },
      { body: { data: { publish_id: "v1" }, error: { code: "ok" } } },
      { body: { data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok" } } },
    ]);

    await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep, attempts: 1 },
    );

    expect(calls[0]!.url).toContain("/creator_info/query/");
    expect(JSON.parse(calls[1]!.body).post_info.privacy_level).toBe("SELF_ONLY");
  });

  it("refuses when the creator has no privacy option at all, rather than guessing one", async () => {
    const { fetchImpl } = stub([
      { body: { data: { creator_username: "lumo", privacy_level_options: [] }, error: { code: "ok" } } },
    ]);

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toThrowError(/privacy setting/i);
  });

  /**
   * TikTok answers HTTP 200 with a failure code, so the body is authoritative
   * and the status alone is not. A connector that trusted the status would
   * record a failed post as published.
   */
  it("reads the error code even on HTTP 200", async () => {
    const { fetchImpl } = stub([
      { status: 200, body: { error: { code: "scope_not_authorized", message: "no grant" } } },
    ]);

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ kind: "token_revoked" });
  });

  it("names the domain-verification step when TikTok will not fetch the media", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { status: 403, body: { error: { code: "url_ownership_unverified", message: "unverified" } } },
    ]);

    const error = await refusal(publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep },
    ));

    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.kind).toBe("rejected");
    expect(error.message).toMatch(/verified/i);
    expect(error.message).toMatch(/URL prefix/i);
  });

  it("says the app is unaudited when that is why the post cannot be public", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      {
        status: 403,
        body: { error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "" } },
      },
    ]);

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toThrowError(/audit/i);
  });

  it("reports a daily post cap as rate limiting, so nothing retries blindly", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { status: 403, body: { error: { code: "spam_risk_too_many_posts", message: "" } } },
    ]);

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  /**
   * TikTok publishes asynchronously, so "still processing" is not a failure.
   * Recording it as one would invite a retry, and a retry would post twice.
   */
  it("records an accepted but unfinished post as published, with no permalink", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v_pub_url~v2.9" }, error: { code: "ok" } } },
      { body: { data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok" } } },
    ]);

    const receipt = await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep, attempts: 2 },
    );

    expect(receipt.externalId).toBe("v_pub_url~v2.9");
    expect(receipt.permalink).toBeNull();
  });

  /**
   * A private post is complete and has no public id, so there is genuinely no
   * link. Inventing a profile URL would point a founder at the wrong thing.
   */
  it("gives no permalink for a completed post TikTok kept private", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v1" }, error: { code: "ok" } } },
      { body: { data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } } },
    ]);

    const receipt = await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep },
    );

    expect(receipt.externalId).toBe("v1");
    expect(receipt.permalink).toBeNull();
  });

  it("turns a failed download into the URL problem the founder can fix", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v1" }, error: { code: "ok" } } },
      {
        body: {
          data: { status: "FAILED", fail_reason: "video_pull_failed" },
          error: { code: "ok" },
        },
      },
    ]);

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toThrowError(/could not download the video/i);
  });

  /**
   * NFR-03 / FR-12: a lost connection may have left a post behind, so it is
   * never reported as a clean failure that something would retry.
   */
  it("reports a dropped connection as an unknown outcome", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up");
    }) as typeof fetch;

    await expect(
      publishToTikTok(
        { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
        fetchImpl,
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ kind: "outcome_unknown" });
  });
});

describe("the bounded status wait, when the status call itself fails", () => {
  /**
   * The publish already succeeded by the time the status wait runs, so a
   * failure *of the wait* says nothing about the post. Reporting the job as
   * failed would be wrong twice: the post exists, and a retry of a failed job
   * would publish it again, in public.
   */
  it("still reports the post as published when the status check is refused", async () => {
    const { fetchImpl } = stub([
      creatorInfo,
      { body: { data: { publish_id: "v_pub_url~v2.5" }, error: { code: "ok" } } },
      { status: 429, body: { error: { code: "rate_limit_exceeded", message: "slow down" } } },
    ]);

    const receipt = await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep },
    );

    expect(receipt.externalId).toBe("v_pub_url~v2.5");
    expect(receipt.permalink).toBeNull();
  });

  it("still reports it as published when the status connection drops", async () => {
    let call = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify(creatorInfo.body), {
          headers: { "content-type": "application/json" },
        });
      }
      if (call === 2) {
        return new Response(JSON.stringify({ data: { publish_id: "v9" }, error: { code: "ok" } }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (String(input).includes("/status/fetch/")) throw new Error("socket hang up");
      throw new Error(`unexpected call to ${String(input)}`);
    }) as typeof fetch;

    const receipt = await publishToTikTok(
      { accessToken: "at", openId: "open-1", payload: { ...payload, video_url: "https://cdn/x.mp4" } },
      fetchImpl,
      { sleep: noSleep },
    );

    expect(receipt.externalId).toBe("v9");
    expect(receipt.permalink).toBeNull();
  });
});
