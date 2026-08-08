/**
 * Nominatim. No key, no dependency, sub-second — which is the point: the
 * visitor confirms the area before we spend 20-90s in the Apify actor.
 *
 * ponytail: never throws. A failed geocode should skip the confirm step, not
 * kill the conversation. Upgrade path is a paid geocoder if rate limits bite.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Nominatim's usage policy requires an identifying User-Agent.
const UA = "dial-voice-canvas (https://github.com/shameerthaha/warm-hackathondemo)";

const TIMEOUT_MS = 4000;

export type Area = { label: string; lat: number; lng: number };

export async function geocode(query: string, signal?: AbortSignal): Promise<Area | null> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: "json", limit: "1" })}`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || body.length === 0) return null;

    const hit = body[0] as Record<string, unknown>;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { label: typeof hit.display_name === "string" ? hit.display_name : query, lat, lng };
  } catch {
    return null;
  }
}
