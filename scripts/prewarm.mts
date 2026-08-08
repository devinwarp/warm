/**
 * Run before the pitch, on venue wifi, against the deployed URL:
 *   node scripts/prewarm.mts https://dial.vercel.app
 *
 * Fills the places cache so every demo query answers instantly. The first run
 * is slow by design — that is the Apify actor. The second should be instant.
 */

const base = process.argv[2] ?? "http://localhost:3000";

const QUERIES: { query: string; area?: string }[] = [
  { query: "Qamar Table", area: "Jumeirah Lake Towers Dubai" },
  { query: "Ruwaya Hair Studio", area: "Al Wasl Road Dubai" },
  { query: "Meridian Dental Rooms", area: "Jumeirah 1 Dubai" },
  { query: "Lebanese restaurant", area: "Jumeirah Lake Towers Dubai" },
  { query: "Middle Eastern restaurant", area: "Downtown Dubai" },
];

let failed = 0;

for (const { query, area } of QUERIES) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, area, limit: 6 }),
    });
    const body = (await response.json()) as { places?: unknown[]; error?: string };
    const seconds = Math.round((Date.now() - started) / 1000);

    if (!response.ok) failed++;
    console.log(
      `${response.ok ? "ok  " : "FAIL"} ${String(seconds).padStart(3)}s  ${query} / ${area ?? "-"}  ${
        body.error ?? `${body.places?.length ?? 0} places`
      }`,
    );
  } catch (error) {
    failed++;
    console.log(`FAIL   ?s  ${query} / ${area ?? "-"}  ${error instanceof Error ? error.message : error}`);
  }
}

// Non-zero exit so a red pre-warm can't be mistaken for a green one at a glance.
if (failed > 0) {
  console.error(`\n${failed}/${QUERIES.length} queries failed — the demo is not warm.`);
  process.exit(1);
}
console.log(`\nall ${QUERIES.length} warm.`);
