import "server-only";

/**
 * The single place a model provider is called (T2.2).
 *
 * The provider is chosen by environment, not by code — no provider SDK is
 * imported anywhere else in the app, so swapping OpenRouter for Google is a
 * deployment change. Keys are read here and nowhere else (Constitution IX).
 *
 * Uses the OpenAI-compatible chat-completions shape, which OpenRouter, Groq,
 * Together, and a local llama.cpp server all speak. A provider that does not
 * gets a new branch in `baseUrlFor`, not a new call site.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GenerationResult = {
  text: string;
  model: string;
  promptTokens: number | null;
  outputTokens: number | null;
  /**
   * The provider stopped because it hit its output ceiling, so `text` is a
   * sentence — or a JSON document — cut off mid-way (005 D-1). Callers that
   * parse structured output need this to tell "the model answered badly" from
   * "the model ran out of room", which are fixed by different things.
   */
  truncated: boolean;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
    /** "config": our credentials or settings are wrong; retrying cannot help. */
    readonly kind: "config" | "upstream" = "upstream",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * The user-facing sentence for a provider failure (SC-08). Logged here because
 * these are returned as form state, so nothing else reaches the runtime logs.
 */
export function providerFailureMessage(error: ProviderError): string {
  console.error(`AI provider failure (${error.kind}):`, error.message);
  return error.kind === "config"
    ? "AI is not configured correctly on our side, so nothing was generated. " +
        "This is a configuration problem, not a problem with your page."
    : "The AI provider did not respond. Try again in a moment.";
}

function baseUrlFor(provider: string): string {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "openai-compatible":
      return requireEnv("AI_BASE_URL");
    default:
      throw new ProviderError(
        `Unknown AI_PROVIDER "${provider}". Use openrouter, groq, or openai-compatible.`,
        false,
        "config",
      );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ProviderError(`Missing environment variable ${name}.`, false, "config");
  return value;
}

export function configuredModel(): string {
  return process.env.AI_MODEL ?? "unset";
}

/** True when the server has enough configuration to attempt a generation. */
export function isProviderConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY && process.env.AI_MODEL);
}

export async function generate(
  messages: ChatMessage[],
  options: { timeoutMs?: number; jsonMode?: boolean } = {},
): Promise<GenerationResult> {
  const provider = requireEnv("AI_PROVIDER");
  const apiKey = requireEnv("AI_API_KEY");
  const model = requireEnv("AI_MODEL");
  const url = baseUrlFor(provider);

  // NFR-002 targets p95 under 60s, so give up at 60s rather than hanging a
  // request that the user has already stopped waiting for.
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ProviderError(
        `Provider returned ${response.status}. ${detail.slice(0, 300)}`,
        response.status >= 500 || response.status === 429,
        // Rejected key, no credit, or no access to the model.
        [401, 402, 403].includes(response.status) ? "config" : "upstream",
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = payload.choices?.[0];
    const text = choice?.message?.content;
    if (!text) throw new ProviderError("Provider returned no content.", true);

    return {
      text,
      model,
      promptTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      // Every OpenAI-compatible provider reports this; "length" is the only
      // value that means the answer was cut rather than finished.
      truncated: choice?.finish_reason === "length",
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`Provider timed out after ${timeoutMs}ms.`, true);
    }
    throw new ProviderError(
      error instanceof Error ? error.message : "Provider call failed.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
