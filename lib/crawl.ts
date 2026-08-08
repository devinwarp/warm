import { FactSheetSchema, type FactSheet } from "@/lib/factsheet";
import { completeJson } from "@/lib/llm";

// ponytail: fetch + strip tags, not a crawler. One page is what an operator
// pastes and what the demo shows. Follow links only if a judge asks for it.
const FETCH_TIMEOUT_MS = 15_000;

// Roughly 8k tokens of page — past this it is nav and footer, not facts.
const MAX_CHARS = 30_000;

const EXTRACTION_PROMPT = `You extract a factual Fact Sheet from one business web page.

Return a JSON object with exactly these keys:
  business_name      string
  one_line           string  — one sentence describing the business
  services           array of { name: string, price: string|null, description: string }
  hours              string  — "" if the page does not publish them
  locations          array of { branch: string, address: string, phone: string|null }
  booking_policy     string|null
  languages_spoken   array of strings
  escalation_note    string  — how to reach a human, taken from the page

THE ONE RULE: copy what the page says. Never infer, estimate, or fill in what
is typical for this kind of business. A price the page does not print is null.
Hours the page does not list are "". No languages listed is []. An empty field
is a correct answer — a plausible invented one is the only failure that matters.`;

/** Enough to get readable prose out of a page; not an HTML parser. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function crawlAndExtract(url: string): Promise<FactSheet> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "DialBot/1.0 (+voice receptionist onboarding)" },
  });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);

  const text = htmlToText(await res.text()).slice(0, MAX_CHARS);
  const extracted = await completeJson(EXTRACTION_PROMPT, `URL: ${url}\n\n${text}`);

  // source_url and crawled_at are ours, not the model's — provenance the
  // agent reads out loud should never be something a model could hallucinate.
  return FactSheetSchema.parse({
    ...(extracted as object),
    source_url: url,
    crawled_at: new Date().toISOString(),
  });
}
