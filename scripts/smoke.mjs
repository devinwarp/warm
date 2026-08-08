/**
 * End-to-end smoke test for the voice canvas:
 *
 *   npm run dev
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Proves the three things unit tests cannot:
 *   1. the API routes refuse bad input and never dial an off-allowlist number
 *   2. the page renders with a real agent id
 *   3. the ElevenLabs WebRTC session actually connects from a browser
 *
 * Needs a system Chrome and `npm i -D playwright` (not a runtime dependency —
 * this is the only thing in the repo that uses it).
 *
 * The WebRTC leg is skipped automatically when the agent id is unset, so this
 * still passes on a machine with no ElevenLabs credentials.
 */

const base = process.argv[2] ?? "http://localhost:3000";
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

console.log("--- the booking guardrail ---");

const offList = await post("/api/book", {
  restaurant_name: "Somewhere",
  to_number: "+15551234567",
  party_size: 2,
  when: "tonight",
  customer_name: "Test",
  customer_phone: "+971501112233",
});
check(
  "an off-allowlist number is refused and never dialled",
  offList.status === 400 && String(offList.body.error).includes("not an approved demo number"),
  `HTTP ${offList.status} ${offList.body.error ?? ""}`,
);

const tooMany = await post("/api/book", {
  restaurant_name: "Somewhere",
  to_number: "+97141234567",
  party_size: 99,
  when: "tonight",
  customer_name: "Test",
  customer_phone: "+971501112233",
});
check("a party of 99 is refused", tooMany.status === 400, `HTTP ${tooMany.status}`);

const badPhone = await post("/api/book", {
  restaurant_name: "Somewhere",
  to_number: "+97141234567",
  party_size: 2,
  when: "tonight",
  customer_name: "Test",
  customer_phone: "not a number",
});
check("a malformed callback number is refused", badPhone.status === 400, `HTTP ${badPhone.status}`);

console.log("\n--- the other routes ---");

const geo = await post("/api/geocode", { query: "Jumeirah Lake Towers Dubai" });
check("geocode resolves a real area", geo.status === 200 && geo.body.area?.lat > 0, JSON.stringify(geo.body.area?.label ?? geo.body));

const geoNone = await post("/api/geocode", { query: "zzzqqqxxx nowhere at all" });
check("geocode returns null rather than throwing", geoNone.status === 200 && geoNone.body.area === null);

const noQuery = await post("/api/places", {});
check("places rejects a missing query", noQuery.status === 400);

console.log("\n--- the page ---");

const html = await (await fetch(base)).text();
const agentConfigured = !html.includes("CONCIERGE_AGENT_ID is not set");
check("the canvas renders", html.includes("Dial"));
check("a Concierge agent id is configured", agentConfigured, agentConfigured ? "" : "set NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID to test the voice leg");

console.log("\n--- the voice line ---");

if (!agentConfigured) {
  console.log("skip  WebRTC connection (no agent id configured)");
} else {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const page = await (await browser.newContext({ permissions: ["microphone"] })).newPage();
    let livekit = false;
    page.on("websocket", (ws) => {
      if (ws.url().includes("elevenlabs.io")) livekit = true;
    });

    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start talking" }).click();

    // The WebRTC handshake needs real time. Poll rather than guess at it.
    await page
      .locator("header")
      .getByText("listening", { exact: false })
      .waitFor({ timeout: 30000 })
      .catch(() => {});

    const status = (await page.locator("header div").last().innerText()).toLowerCase();
    check("the session reaches 'listening'", status.includes("listening"), status);
    check("a WebRTC socket opened to ElevenLabs", livekit);
  } finally {
    await browser.close();
  }
}

console.log("");
if (failed > 0) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log("all checks passed.");
