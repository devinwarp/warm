import { SITES, fallbackLine, isDemoSlug, isPreset, renderSite } from "@/lib/demo";
import { getDemoPreset } from "@/lib/supabase";

/**
 * GET /demo/:slug — one of the three fixture business sites.
 *
 * This is the URL you crawl at onboarding and the URL lookup_live re-reads
 * mid-call. It is server-rendered on every request so that flipping the status
 * line in Supabase shows up on the very next scrape, with no deploy.
 *
 * Owner: Shameer.
 */

// No caching anywhere in the chain, or the live tier has nothing to find:
// Context.dev already scrapes with maxAgeMs=0, and this is our half of it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isDemoSlug(slug)) {
    return new Response("Unknown demo site", { status: 404 });
  }

  const preset = await getDemoPreset(slug);
  const line = (preset && isPreset(slug, preset) && SITES[slug].presets[preset]) || fallbackLine(slug);

  return new Response(await renderSite(slug, line), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
