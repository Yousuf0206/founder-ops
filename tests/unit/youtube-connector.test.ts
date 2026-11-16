import { describe, expect, it } from "vitest";

import { ConnectorError } from "@/lib/connectors/errors";
import {
  exchangeYouTubeCode,
  fetchYouTubeChannel,
  refreshYouTubeToken,
  youTubeAuthorizationUrl,
  YOUTUBE_SCOPES,
} from "@/lib/connectors/youtube/oauth";
import {
  composeYouTubeDescription,
  composeYouTubeTitle,
  publishToYouTube,
  YouTubeVideoRequiredError,
  YOUTUBE_MAX_VIDEO_BYTES,
  YOUTUBE_TITLE_LIMIT,
} from "@/lib/connectors/youtube/publish";
import type { ContentPayload } from "@/lib/ai/content";

/**
 * The YouTube connector (007).
 *
 * YouTube is the one platform in this product that cannot publish words at all
 * — its Data API has no endpoint that creates a text post — so the tests that
 * matter are about the refusals: no video means no API call, an oversized video
 * is refused before a session is opened, and a connection lost mid-upload is
 * never reported as a clean failure.
 *
 * All of it runs against a stub fetch, so nothing here asserts YouTube's
 * behaviour — only our request shape and our reading of its answers.
 */

const env = { YOUTUBE_CLIENT_ID: "client-1", YOUTUBE_CLIENT_SECRET: "shh" };

const payload: ContentPayload = {
  hook: "Study smarter",
  script: "Spaced repetition beats cramming.",
  captions: [],
  titles: ["Spaced repetition in 60 seconds"],
  hashtags: ["#learning"],
  cta: "Try a free lesson",
  visual_plan: "",
  image_url: "",
  video_url: "",
};

const withVideo = { ...payload, video_url: "https://cdn.example/x.mp4" };

type StubResponse = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

function stub(responses: StubResponse[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    const next = responses[Math.min(index, responses.length - 1)] ?? {};
    index += 1;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json", ...(next.headers ?? {}) },
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

/** A HEAD answer for a video of a given size. */
function head(bytes: number): StubResponse {
  return { headers: { "content-length": String(bytes), "content-type": "video/mp4" } };
}

/** A body a resumable PUT can stream. */
function videoBody(): StubResponse {
  return { body: {}, headers: {} };
}

describe("the YouTube authorization URL", () => {
  /**
   * The single most consequential detail in this connector. Google issues a
   * refresh token only for an offline grant, and only on the FIRST
   * authorization — so without `prompt=consent` a reconnect yields an access
   * token good for an hour and no way to renew it, and every scheduled upload
   * afterwards fails.
   */
  it("asks for offline access and forces consent, or there is no refresh token", () => {
    const url = new URL(
      youTubeAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb" }, env),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("asks for upload and the read scope that lets it name the channel", () => {
    const url = new URL(
      youTubeAuthorizationUrl({ state: "abc", redirectUri: "https://app.example/cb" }, env),
    );

    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPES.join(" "));
    expect(YOUTUBE_SCOPES).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(YOUTUBE_SCOPES).toContain("https://www.googleapis.com/auth/youtube.readonly");
  });

  it("refuses to build a URL when the app is not configured", () => {
    expect(() => youTubeAuthorizationUrl({ state: "a", redirectUri: "b" }, {})).toThrowError(
      /not configured/i,
    );
  });
});

describe("exchanging a YouTube code", () => {
  it("keeps the refresh token and the expiry", async () => {
    const { fetchImpl } = stub([
      { body: { access_token: "at", refresh_token: "rt", expires_in: 3_600, scope: "a b" } },
    ]);

    const tokens = await exchangeYouTubeCode(
      { code: "c", redirectUri: "https://app.example/cb" },
      fetchImpl,
      env,
      1_000,
    );

    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.expiresAt?.getTime()).toBe(1_000 + 3_600_000);
  });

  /**
   * Refusing is better than storing: a connection with no refresh token works
   * for an hour and then fails every scheduled upload, with nothing on screen
   * explaining why.
   */
  it("refuses a grant with no refresh token rather than storing an hour-long connection", async () => {
    const { fetchImpl } = stub([{ body: { access_token: "at", expires_in: 3_600 } }]);

    await expect(
      exchangeYouTubeCode({ code: "c", redirectUri: "r" }, fetchImpl, env),
    ).rejects.toThrowError(/refresh token/i);
  });
});

describe("refreshing a YouTube token", () => {
  /**
   * Google does not rotate the refresh token and usually returns none at all.
   * Returning null here is correct — the caller keeps the stored one — and the
   * executor must not write that null over a working credential.
   */
  it("returns no refresh token when Google sends none, because the old one still works", async () => {
    const { fetchImpl } = stub([{ body: { access_token: "at2", expires_in: 3_600 } }]);

    const tokens = await refreshYouTubeToken("rt1", fetchImpl, env);

    expect(tokens.accessToken).toBe("at2");
    expect(tokens.refreshToken).toBeNull();
  });

  it("reports a refused refresh as a revoked connection", async () => {
    const { fetchImpl } = stub([
      { status: 400, body: { error: "invalid_grant", error_description: "expired or revoked" } },
    ]);

    await expect(refreshYouTubeToken("rt1", fetchImpl, env)).rejects.toMatchObject({
      kind: "token_revoked",
    });
  });
});

describe("reading the channel", () => {
  it("names the channel a founder just connected", async () => {
    const { calls, fetchImpl } = stub([
      { body: { items: [{ id: "UC123", snippet: { title: "Lumo" } }] } },
    ]);

    const identity = await fetchYouTubeChannel("at", fetchImpl);

    expect(calls[0]!.url).toContain("mine=true");
    expect(identity.externalAccountId).toBe("UC123");
    expect(identity.displayName).toBe("Lumo (YouTube)");
  });

  /**
   * A Google account with no YouTube channel authorizes perfectly well and has
   * nowhere to publish. Finding that out at connect time is much better than at
   * publish time, which is why this call is strict where TikTok's is forgiving.
   */
  it("refuses a Google account that has no channel", async () => {
    const { fetchImpl } = stub([{ body: { items: [] } }]);

    await expect(fetchYouTubeChannel("at", fetchImpl)).rejects.toThrowError(/no YouTube channel/i);
  });
});

describe("composing a YouTube video", () => {
  it("prefers a title the pack already wrote", () => {
    expect(composeYouTubeTitle(payload)).toBe("Spaced repetition in 60 seconds");
  });

  it("never truncates the title: it uses something that fits, or nothing", () => {
    const long = "x".repeat(300);

    const title = composeYouTubeTitle({ ...payload, titles: [long], hook: long, script: `Fits. ${long}` });
    expect(title.length).toBeLessThanOrEqual(YOUTUBE_TITLE_LIMIT);
    expect(title).toBe("Fits.");

    expect(composeYouTubeTitle({ ...payload, titles: [long], hook: long, script: long })).toBe("");
  });

  it("puts the approved words in the description, in reading order", () => {
    expect(composeYouTubeDescription(payload)).toBe(
      "Study smarter\n\nSpaced repetition beats cramming.\n\nTry a free lesson\n\n#learning",
    );
  });
});

describe("publishing to YouTube", () => {
  /**
   * The headline refusal of this milestone. YouTube's API has no endpoint that
   * publishes text, so a post without a video is not a failed upload — it is a
   * post that can never be uploaded, and it costs zero calls to say so.
   */
  it("refuses a post with no video before making any network call", async () => {
    const { calls, fetchImpl } = stub([{ body: {} }]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload }, fetchImpl),
    ).rejects.toBeInstanceOf(YouTubeVideoRequiredError);

    expect(calls).toHaveLength(0);
  });

  it("says the API has no text post, rather than blaming the draft", async () => {
    const error = await refusal(publishToYouTube(
      { accessToken: "at", channelId: "UC1", payload },
      stub([{ body: {} }]).fetchImpl,
    ));

    expect(error.message).toMatch(/no way to publish text/i);
    expect(error.kind).toBe("rejected");
  });

  it("uploads the video and returns a watch link", async () => {
    const { calls, fetchImpl } = stub([
      head(10 * 1024 * 1024),
      { headers: { location: "https://upload.example/session-1" } },
      videoBody(),
      { status: 200, body: { id: "vid-1" } },
    ]);

    const receipt = await publishToYouTube(
      { accessToken: "at", channelId: "UC1", payload: withVideo },
      fetchImpl,
    );

    // The session is opened with the size up front, as the protocol requires.
    expect(calls[1]!.url).toContain("uploadType=resumable");
    expect(calls[1]!.headers["x-upload-content-length"]).toBe(String(10 * 1024 * 1024));
    const metadata = JSON.parse(String(calls[1]!.body));
    expect(metadata.snippet.title).toBe("Spaced repetition in 60 seconds");
    expect(metadata.snippet.description).toBe(composeYouTubeDescription(withVideo));
    // Hashtags become tags, without the hash YouTube does not want.
    expect(metadata.snippet.tags).toEqual(["learning"]);

    // The bytes go to the session URI from the Location header, by PUT.
    expect(calls[3]!.url).toBe("https://upload.example/session-1");
    expect(calls[3]!.method).toBe("PUT");

    expect(receipt.externalId).toBe("vid-1");
    expect(receipt.permalink).toBe("https://www.youtube.com/watch?v=vid-1");
  });

  /**
   * NFR-03. The upload streams through a function with a time limit, so a video
   * that cannot plausibly fit is refused with its size and the cap — never
   * started and killed halfway.
   */
  it("refuses an oversized video before opening a session, naming the numbers", async () => {
    const { calls, fetchImpl } = stub([head(YOUTUBE_MAX_VIDEO_BYTES + 1)]);

    const error = await refusal(publishToYouTube(
      { accessToken: "at", channelId: "UC1", payload: withVideo },
      fetchImpl,
    ));

    expect(error.message).toMatch(/128 MB/);
    // Only the HEAD happened: nothing was opened at YouTube's end.
    expect(calls).toHaveLength(1);
  });

  it("refuses a URL that will not say how big the file is", async () => {
    const { fetchImpl } = stub([{ headers: { "content-type": "video/mp4" } }]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toThrowError(/how large/i);
  });

  it("refuses a video URL this server cannot reach", async () => {
    const { fetchImpl } = stub([{ status: 404, body: {} }]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toThrowError(/404/);
  });

  it("reports a used-up project quota as rate limiting, not as a rejected video", async () => {
    const { fetchImpl } = stub([
      head(1024),
      {
        status: 403,
        body: { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } },
      },
    ]);

    const error = await refusal(publishToYouTube(
      { accessToken: "at", channelId: "UC1", payload: withVideo },
      fetchImpl,
    ));

    expect(error.kind).toBe("rate_limited");
    expect(error.message).toMatch(/quota/i);
  });

  it("reports a rejected token as a connection to redo", async () => {
    const { fetchImpl } = stub([head(1024), { status: 401, body: { error: { message: "bad" } } }]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toMatchObject({ kind: "token_revoked" });
  });

  it("fails cleanly when YouTube opens no session, since nothing was uploaded", async () => {
    const { fetchImpl } = stub([head(1024), { status: 200, body: {} }]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  /**
   * FR-12. The video may exist and the answer may have been lost, so a retry
   * could publish the same video twice. This is never a clean failure.
   */
  it("reports a connection lost during the upload as an unknown outcome", async () => {
    let call = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response(null, {
          headers: { "content-length": "1024", "content-type": "video/mp4" },
        });
      }
      if (call === 2) {
        return new Response(null, { headers: { location: "https://upload.example/session-1" } });
      }
      if (call === 3) return new Response(JSON.stringify({}), { status: 200 });
      if (init?.method === "PUT") throw new Error("socket hang up");
      throw new Error(`unexpected call to ${String(input)}`);
    }) as typeof fetch;

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toMatchObject({ kind: "outcome_unknown" });
  });

  /**
   * A 308 means Google stored only part of the file, so no video resource was
   * created — nothing was published and a retry is safe. That is a different
   * claim from the one above, and getting it wrong in either direction either
   * loses a post or double-posts.
   */
  it("treats a partial upload as a safe failure, because no video was created", async () => {
    const { fetchImpl } = stub([
      head(1024),
      { headers: { location: "https://upload.example/session-1" } },
      videoBody(),
      { status: 308, body: {} },
    ]);

    await expect(
      publishToYouTube({ accessToken: "at", channelId: "UC1", payload: withVideo }, fetchImpl),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
