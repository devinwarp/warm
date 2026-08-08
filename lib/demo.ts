import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The three fixture businesses we crawl on stage, and the one line on each
 * that we move mid-call to prove the live tier is actually live.
 *
 * The pages are hand-written HTML in demo-sites/. They are deliberately NOT in
 * public/ — a statically served copy would carry a frozen status line, and
 * crawling that URL by mistake would quietly kill the demo.
 */

export type DemoSlug = "ruwaya" | "qamar" | "meridian";

type Site = {
  /** Shown on the confirmation page after a flip. */
  business: string;
  /** Preset key -> the sentence that replaces the status line. */
  presets: Record<string, string>;
  /** Which preset the page shows before anyone touches it. */
  fallback: string;
};

// Only preset keys are accepted over the wire, never free text: the value is
// injected into the page as raw HTML, and a fixed set means nothing to escape.
export const SITES: Record<DemoSlug, Site> = {
  ruwaya: {
    business: "Ruwaya Hair Studio",
    fallback: "open",
    presets: {
      open: "Saturday 8 August — open 10:00 to 22:00. Last colour appointment taken at 19:30.",
      closed:
        "Saturday 8 August — CLOSED for the rest of today. A burst pipe in the villa; " +
        "we are calling everyone with an appointment. Back to normal hours tomorrow.",
      late: "Saturday 8 August — open late tonight, till midnight, for the Al Wasl street festival.",
    },
  },
  qamar: {
    business: "Qamar Table",
    fallback: "open",
    presets: {
      open: "Saturday 8 August — the grill stops at 23:00 and the kitchen closes at 23:30. Two tables left for walk-ins after 21:00.",
      early:
        "Saturday 8 August — the kitchen is closing early tonight, last orders 21:00. " +
        "A private event has taken the whole downstairs room.",
      full: "Saturday 8 August — fully committed tonight, no walk-in tables left. The terrace bar is still first come.",
    },
  },
  meridian: {
    business: "Meridian Dental Rooms",
    fallback: "normal",
    presets: {
      normal:
        "Dr Haddad is away until Wednesday 12 August. Hygiene appointments are running as normal.",
      emergency:
        "Both surgeries are running about forty minutes behind today after an emergency this morning. " +
        "Walk-in emergency slots are gone for today.",
      closed:
        "The practice is closed today, Saturday 8 August, for a water outage on Street 10b. " +
        "Everyone booked in has been moved to next week.",
    },
  },
};

// hasOwn, not `in`: "constructor" and "toString" are `in` every object, and
// either one would send renderSite looking for a file that isn't there.
export function isDemoSlug(value: string): value is DemoSlug {
  return Object.hasOwn(SITES, value);
}

export function isPreset(slug: DemoSlug, value: string): boolean {
  return Object.hasOwn(SITES[slug].presets, value);
}

/** The default sentence for a site — used until someone flips it. */
export function fallbackLine(slug: DemoSlug): string {
  const site = SITES[slug];
  return site.presets[site.fallback]!;
}

/**
 * The page HTML with `line` dropped into the status band.
 *
 * ponytail: read from disk per request rather than bundled as a string, so the
 * pages stay editable as real .html files. next.config.ts traces demo-sites/
 * into the function bundle — without that entry this throws ENOENT in prod.
 */
export async function renderSite(slug: DemoSlug, line: string): Promise<string> {
  const file = path.join(process.cwd(), "demo-sites", `${slug}.html`);
  const html = await readFile(file, "utf8");
  return html.replace("<!--STATUS-->", `<span>${line}</span>`);
}
