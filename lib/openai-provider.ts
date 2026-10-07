const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6";
const DEFAULT_TIMEOUT_MS = 30_000;

type ResponseContent = { type?: string; text?: string };
type ResponseOutput = { type?: string; content?: ResponseContent[] };
type OpenAIResponse = {
  id?: string;
  error?: { code?: string; message?: string };
  output?: ResponseOutput[];
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export class AiProviderError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = status;
  }
}

function cleanProviderMessage(value: unknown) {
  return String(value ?? "The AI provider could not complete this request.")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
}

function responseText(data: OpenAIResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function openAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export async function generateOpenAiDraft(input: { instructions: string; messages: Array<{ role: "user" | "assistant"; content: string }> }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiProviderError("PROVIDER_NOT_CONFIGURED", "OPENAI_API_KEY is not configured.", 503);

  const model = openAiModel();
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: input.instructions,
        input: input.messages,
        max_output_tokens: 800,
        store: false,
      }),
      signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiProviderError(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", timedOut ? "The AI provider timed out." : "The AI provider is unavailable.", 502);
  }

  const data = (await response.json().catch(() => ({}))) as OpenAIResponse;
  if (!response.ok) {
    const providerCode = String(data.error?.code ?? `HTTP_${response.status}`).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
    throw new AiProviderError(`OPENAI_${providerCode}`, cleanProviderMessage(data.error?.message), response.status >= 500 ? 502 : 400);
  }

  const text = responseText(data).slice(0, 4000);
  if (!text) throw new AiProviderError("PROVIDER_EMPTY_RESPONSE", "The AI provider returned no draft text.", 502);
  return {
    providerResponseId: data.id ?? null,
    model,
    text,
    inputTokens: Number.isInteger(data.usage?.input_tokens) ? data.usage?.input_tokens : null,
    outputTokens: Number.isInteger(data.usage?.output_tokens) ? data.usage?.output_tokens : null,
  };
}
