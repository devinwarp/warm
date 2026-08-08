import { z } from "zod";
import { scrapeMarkdown } from "./contextdev";
import { complete } from "./llm";

/**
 * The live read: what is true about a business *right now*.
 *
 * Context.dev scrapes the place's Google listing at request time — that page
 * carries the rating and, crucially, the open/closed line ("Open · Closes 2
 * AM"), which is the one fact a cached crawl can never be right about. The
 * business's own website never says how it is rated, so this is a different
 * source answering a different question from lib/crawl.ts.
 *
 * Review *text* is not in that page's markdown. Review counts and keywords
 * come from the places search instead (lib/places.ts), and the card shows
 * both together. Nothing here invents a review.
 */

const LiveReadSchema = z.object({
  rating: z.string().nullable(),
  open_now: z.string().nullable(),
  summary: z.string().nullable(),
  hours: z.string().nullable(),
  highlights: z.array(z.string()),
});

export type LiveRead = z.infer<typeof LiveReadSchema> & {
  name: string;
  source_url: string;
  read_at: string;
};

const PROMPT = `You are reading a business's Google Maps listing, converted to markdown.

Return ONLY a JSON object, no prose and no code fence:
{
  "rating": string|null,      // the star rating exactly as printed, e.g. "4.3". null if absent.
  "open_now": string|null,    // the open/closed line exactly as printed, e.g. "Open · Closes 2 AM". null if absent.
  "summary": string|null,     // the one-sentence description of the place, if the page has one.
  "hours": string|null,       // today's hours as printed, e.g. "8 AM–2 AM". null if absent.
  "highlights": string[]      // up to 4 short factual phrases the page states (cuisine, service options,
                              // price band). Copy the page's wording. [] if none.
}

Copy values from the page. Never estimate a rating, never infer whether it is
open, never write a review. If the page does not say it, the value is null.`;

export async function readLive(
  name: string,
  googleUrl: string,
  signal?: AbortSignal,
): Promise<LiveRead> {
  // useMainContentOnly must stay off: Google's listing puts the rating and the
  // open/closed line in chrome that main-content extraction throws away.
  const markdown = await scrapeMarkdown(googleUrl, signal, { mainContentOnly: false });

  const raw = await complete(PROMPT, `Listing for ${name}:\n\n${markdown.slice(0, 12000)}`, { signal });

  // The model is asked for bare JSON but sometimes fences it anyway.
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");

  const parsed = LiveReadSchema.safeParse(JSON.parse(json));
  if (!parsed.success) throw new Error("could not read the listing");

  return { ...parsed.data, name, source_url: googleUrl, read_at: new Date().toISOString() };
}
