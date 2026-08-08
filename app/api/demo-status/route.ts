import { SITES, type DemoSlug, fallbackLine, isDemoSlug, isPreset } from "@/lib/demo";
import { getDemoPreset, setDemoPreset } from "@/lib/supabase";

/**
 * GET /api/demo-status              -> the tap sheet: every site, every preset
 * GET /api/demo-status?slug=&preset= -> flip that site, show what it now says
 *
 * This is the stage control for the live tier. Bookmark the bare URL on your
 * phone, tap a preset mid-call, then ask the agent the same question again.
 *
 * ponytail: a GET that writes, which is wrong everywhere except here — it has
 * to be one tap from a phone bookmark with no JS, no form and no second screen.
 * A crawler that finds this can only move a fixture business between three
 * sentences we wrote. Free text is deliberately not accepted.
 *
 * Owner: Shameer.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug");
  const preset = params.get("preset");

  if (slug && preset) {
    if (!isDemoSlug(slug) || !isPreset(slug, preset)) {
      return html(page(`Unknown site or preset: ${slug} / ${preset}`, await sheet()), 404);
    }
    await setDemoPreset(slug, preset);
    const line = SITES[slug].presets[preset]!;
    return html(
      page(
        `<p class="ok">${SITES[slug].business} now says</p><p class="line">${line}</p>` +
          `<p class="hint">Ask the agent again. The next lookup_live re-reads the page.</p>`,
        await sheet(),
      ),
    );
  }

  return html(page("", await sheet()));
}

/** The current state of all three sites, as tappable presets. */
async function sheet(): Promise<string> {
  const slugs = Object.keys(SITES) as DemoSlug[];
  const rows = await Promise.all(
    slugs.map(async (slug) => {
      const site = SITES[slug];
      const current = (await getDemoPreset(slug)) ?? site.fallback;
      const line = site.presets[current] ?? fallbackLine(slug);
      const buttons = Object.keys(site.presets)
        .map(
          (key) =>
            `<a href="?slug=${slug}&preset=${key}"${key === current ? ' class="on"' : ""}>${key}</a>`,
        )
        .join("");
      return `<section>
        <h2>${site.business}</h2>
        <p class="now">${line}</p>
        <nav>${buttons}</nav>
        <p class="url">/demo/${slug}</p>
      </section>`;
    }),
  );
  return rows.join("");
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(banner: string, body: string) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Demo status</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:20px 18px 64px; background:#14110f; color:#f0e9e0;
    font:16px/1.55 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size:13px; letter-spacing:.16em; text-transform:uppercase; color:#9a8f84;
    margin:0 0 24px; font-weight:600; }
  section { padding:20px 0; border-top:1px solid #2c2723; }
  h2 { font-size:19px; margin:0 0 6px; font-weight:600; }
  .now { margin:0 0 14px; color:#b6aa9e; font-size:15px; }
  nav { display:flex; flex-wrap:wrap; gap:8px; }
  nav a { flex:1 1 auto; text-align:center; min-width:96px; padding:14px 16px;
    background:#221d1a; color:#f0e9e0; border-radius:2px; text-decoration:none;
    font-weight:600; font-size:15px; letter-spacing:.02em; }
  nav a.on { background:#e08a3c; color:#14110f; }
  nav a:active { opacity:.7; }
  .url { margin:12px 0 0; font-size:13px; color:#7d736a; font-family:ui-monospace,monospace; }
  .banner { padding:18px; background:#e08a3c; color:#14110f; margin:0 0 24px; }
  .banner .ok { margin:0 0 6px; font-size:12px; letter-spacing:.14em;
    text-transform:uppercase; font-weight:700; }
  .banner .line { margin:0; font-size:17px; font-weight:600; }
  .banner .hint { margin:10px 0 0; font-size:13px; opacity:.8; font-weight:500; }
</style></head><body>
<h1>Dial — demo status</h1>
${banner ? `<div class="banner">${banner}</div>` : ""}
${body}
</body></html>`;
}
