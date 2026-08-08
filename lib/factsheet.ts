import { z } from "zod";

/**
 * The Fact Sheet is the contract between all three workstreams:
 * Data produces it, Voice consumes it, Frontend renders it.
 *
 * Changing this file after T+20 needs Shameer's approval — everyone
 * is building against it in parallel.
 */

export const ServiceSchema = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string(),
});

export const LocationSchema = z.object({
  branch: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
});

export const FactSheetSchema = z.object({
  business_name: z.string(),
  one_line: z.string(),
  services: z.array(ServiceSchema),
  hours: z.string(),
  locations: z.array(LocationSchema),
  booking_policy: z.string().nullable(),
  languages_spoken: z.array(z.string()),
  escalation_note: z.string(),
  source_url: z.string(),
  crawled_at: z.string(),
});

export type Service = z.infer<typeof ServiceSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type FactSheet = z.infer<typeof FactSheetSchema>;

/**
 * Shown to the agent wherever the site published nothing.
 *
 * This string is load-bearing: an empty value reads as "say something
 * plausible", a sentence reads as "refuse and offer a callback". The
 * refusal rule in the system prompt keys off this exact wording.
 */
export const NOT_PUBLISHED = "not published on the site";

/**
 * ElevenLabs dynamic variables are flat strings, so nested arrays have to
 * be rendered to speech-friendly text before the conversation starts.
 */
export function factsheetToVariables(f: FactSheet): Record<string, string> {
  const services = f.services
    .map((s) => `${s.name}${s.price ? ` — ${s.price}` : ""}: ${s.description}`)
    .join("\n");

  const locations = f.locations
    .map((l) => `${l.branch}: ${l.address}${l.phone ? ` (${l.phone})` : ""}`)
    .join("\n");

  return {
    business_name: f.business_name,
    one_line: f.one_line,
    hours: f.hours || NOT_PUBLISHED,
    services: services || NOT_PUBLISHED,
    locations: locations || NOT_PUBLISHED,
    booking_policy: f.booking_policy ?? NOT_PUBLISHED,
    languages_spoken: f.languages_spoken.join(", ") || NOT_PUBLISHED,
    escalation_note: f.escalation_note,
    source_url: f.source_url,
    crawled_at: f.crawled_at,
  };
}
