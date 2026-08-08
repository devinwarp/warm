/**
 * A place as the Google Maps actor sees it, normalized. Same nullability
 * discipline as the Fact Sheet: unpublished is null, nothing is inferred.
 */
export type Place = {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  categories: string[];
  lat: number;
  lng: number;
};

/**
 * Apify's Google Maps actor, called run-sync so one fetch is the whole job.
 * Key read lazily per call, same reasoning as lib/contextdev.ts.
 */

const ACTOR = "compass~crawler-google-places";
const DEFAULT_LIMIT = 6;

function apifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is required");
  return token;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePlace(item: unknown): Place | null {
  if (typeof item !== "object" || item === null) return null;
  const raw = item as Record<string, unknown>;

  const name = str(raw.title);
  if (!name) return null;

  const location = (raw.location ?? {}) as Record<string, unknown>;
  const listed = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === "string")
    : [];
  const fallback = str(raw.categoryName);

  return {
    name,
    address: str(raw.address) ?? "",
    phone: str(raw.phone),
    website: str(raw.website),
    rating: num(raw.totalScore),
    reviews: num(raw.reviewsCount),
    categories: listed.length > 0 ? listed : fallback ? [fallback] : [],
    lat: num(location.lat) ?? 0,
    lng: num(location.lng) ?? 0,
  };
}

export async function searchPlaces(
  query: string,
  { area, limit = DEFAULT_LIMIT, signal }: { area?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<Place[]> {
  const token = apifyToken();
  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // The area goes in the search string, NOT in locationQuery.
        //
        // locationQuery runs the string through Nominatim and scans only the
        // resulting polygon. Colloquial area names ("Jumeirah Lake Towers
        // Dubai") resolve to a point of interest — a hotel, in that case —
        // whose polygon is 0km², so every result is discarded as
        // "outOfLocation" and the actor returns an empty list after 12s.
        // Google's own text search handles area names the way a person would.
        searchStringsArray: [area ? `${query} in ${area}` : query],
        // The single biggest latency lever on this actor. Six is enough to
        // fill a grid and short enough to finish inside a conversation.
        maxCrawledPlacesPerSearch: limit,
        language: "en",
        skipClosedPlaces: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`apify places search failed: ${response.status} ${await response.text()}`);
  }

  const items = (await response.json()) as unknown;
  if (!Array.isArray(items)) return [];
  return items.map(normalizePlace).filter((p): p is Place => p !== null);
}
