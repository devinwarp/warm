/**
 * One model provider for the whole app: OpenRouter's OpenAI-compatible
 * endpoint. No SDK — it is a single POST, and a fetch has no version to keep
 * in step with anything.
 *
 * Swap models with OPENROUTER_MODEL, no code change. The default is cheap
 * enough to re-crawl all afternoon and good enough at "copy this field or
 * write null" — which is the only judgement the extraction pass needs.
 */
export const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-3.1-flash-lite";

type Options = { json?: boolean; model?: string; signal?: AbortSignal };

export async function complete(
  system: string,
  user: string,
  { json = false, model = MODEL, signal }: Options = {},
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
      // Extraction, not writing. Same page in, same sheet out.
      temperature: 0,
    }),
    signal,
  });

  if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openrouter returned no content");

  return content;
}

/** Returns the parsed JSON object from a completion. Throws on anything else. */
export async function completeJson(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return JSON.parse(await complete(system, user, { json: true, signal }));
}
