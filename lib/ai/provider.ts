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
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
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
      );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ProviderError(`Missing environment variable ${name}.`, false);
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
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError("Provider returned no content.", true);

    return {
      text,
      model,
      promptTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
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
