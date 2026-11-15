import { describe, expect, it, vi } from "vitest";

import { errorClass, errorKind, logEvent } from "@/lib/obs/log";

/**
 * 004 T-5.1 / SC-08 — the error taxonomy, as a log field.
 *
 * SC-08 is the claim that a failure can be told apart: a page we could not read
 * is not a missing key, and a missing key is not a provider outage. The user
 * sees that distinction in the message; production sees it in `error_kind`.
 * These tests hold the mapping that makes the second true.
 */

class ThinPageError extends Error {
  constructor() {
    super("thin");
    this.name = "ThinPageError";
  }
}

class ProviderNotConfiguredError extends Error {
  constructor() {
    super("unconfigured");
    this.name = "ProviderNotConfiguredError";
  }
}

class ProviderError extends Error {
  constructor() {
    super("upstream");
    this.name = "ProviderError";
  }
}

class AuthError extends Error {
  constructor() {
    super("nope");
    this.name = "AuthError";
  }
}

describe("error taxonomy", () => {
  it("separates a page we could not read from a key we do not have", () => {
    expect(errorKind(new ThinPageError())).toBe("extract");
    expect(errorKind(new ProviderNotConfiguredError())).toBe("ai_config");
  });

  it("separates our configuration from the provider's behaviour", () => {
    // Constitution R5: these must never collapse into one message or one bucket.
    expect(errorKind(new ProviderNotConfiguredError())).not.toBe(errorKind(new ProviderError()));
    expect(errorKind(new ProviderError())).toBe("ai_provider");
  });

  it("buckets the caller's own failures as auth", () => {
    expect(errorKind(new AuthError())).toBe("auth");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(errorKind(new Error("something else"))).toBe("unknown");
    expect(errorKind("a thrown string")).toBe("unknown");
  });

  it("reports the class name, not the user-facing message", () => {
    // Messages are copy and change; class names are what alerts are built on.
    expect(errorClass(new ThinPageError())).toBe("ThinPageError");
    expect(errorClass(42)).toBe("number");
  });
});

describe("logEvent", () => {
  it("writes one JSON line with the fields production triages on", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent({
      event: "growth.analyze",
      outcome: "error",
      latencyMs: 1840.6,
      runId: "run-1",
      workspaceId: "ws-1",
      model: "some-model",
      status: 502,
      errorClass: "FetchFailedError",
      errorKind: "extract",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({
      event: "growth.analyze",
      outcome: "error",
      latency_ms: 1841,
      run_id: "run-1",
      workspace_id: "ws-1",
      model: "some-model",
      status: 502,
      error_class: "FetchFailedError",
      error_kind: "extract",
    });

    spy.mockRestore();
  });

  it("omits absent fields instead of logging nulls", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent({ event: "growth.pack", outcome: "ok", latencyMs: 10 });

    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(Object.keys(line).sort()).toEqual(["event", "latency_ms", "outcome", "ts"]);

    spy.mockRestore();
  });

  it("never throws, whatever it is handed", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("stdout is gone");
    });

    // Observability must not be the reason a publish or analyze request fails.
    expect(() => logEvent({ event: "x", outcome: "ok", latencyMs: 0 })).not.toThrow();

    spy.mockRestore();
  });
});
