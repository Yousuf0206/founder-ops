import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generate, ProviderError, providerFailureMessage } from "@/lib/ai/provider";

/** SC-08: credential failures must read as configuration, never as the page. */
async function failureFor(status: number): Promise<ProviderError> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status })));
  return generate([{ role: "user", content: "x" }]).then(
    () => {
      throw new Error("expected generate to reject");
    },
    (error: ProviderError) => error,
  );
}

describe("provider failure classification", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([401, 402, 403])("treats HTTP %i as a configuration failure", async (status) => {
    const error = await failureFor(status);
    expect(error.kind).toBe("config");
    expect(providerFailureMessage(error)).toMatch(/configuration problem/);
  });

  it.each([429, 500, 503])("treats HTTP %i as an upstream failure", async (status) => {
    const error = await failureFor(status);
    expect(error.kind).toBe("upstream");
    expect(providerFailureMessage(error)).toMatch(/did not respond/);
  });

  it("treats a missing key as a configuration failure", async () => {
    vi.stubEnv("AI_API_KEY", "");
    await expect(generate([{ role: "user", content: "x" }])).rejects.toMatchObject({
      kind: "config",
    });
  });
});
