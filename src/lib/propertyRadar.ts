/** PropertyRadar URL helpers + server-side RadarID resolution. */

export type PropertyRadarInput = {
  address?: string | null;
  apn?: string | null;
  county?: string | null;
  /** County FIPS (e.g. 48453). Preferred over county name for APN lookups. */
  countyFips?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const PLACEHOLDER_ADDRESSES = new Set([
  "",
  "no street address",
  "no address",
]);

const API_BASE = "https://api.propertyradar.com";

type PrCriterion = { name: string; value: unknown };

type PrSuggestionResult = {
  Criteria?: PrCriterion[];
  Label?: string;
};

type PrPropertiesResponse = {
  results?: Array<{ RadarID?: string }>;
  error?: string;
  message?: string;
};

export function isUsableAddress(
  value: string | null | undefined
): value is string {
  if (value == null) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_ADDRESSES.has(trimmed.toLowerCase());
}

/** Deep link into a property profile in the PropertyRadar web app. */
export function buildPropertyRadarDetailUrl(radarId: string): string {
  const id = radarId.trim();
  if (!id) return "https://app.propertyradar.com/#!/discover";
  return `https://app.propertyradar.com/#!/discover/detail/${encodeURIComponent(id)}`;
}

function getApiKey(): string {
  return process.env.PROPERTYRADAR_API_KEY?.trim() ?? "";
}

async function prFetch(
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<Response> {
  const key = getApiKey();
  if (!key) {
    throw new Error("PROPERTYRADAR_API_KEY is not configured");
  }
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    url.searchParams.set(k, v);
  }
  const { query: _q, ...rest } = init ?? {};
  return fetch(url.toString(), {
    ...rest,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function searchRadarId(criteria: PrCriterion[]): Promise<string | null> {
  const res = await prFetch("/v1/properties", {
    method: "POST",
    // Fields=RadarID is free regardless of Purchase.
    query: { Purchase: "1", Limit: "1", Fields: "RadarID" },
    body: JSON.stringify({ Criteria: criteria }),
  });
  const data = (await res.json()) as PrPropertiesResponse;
  if (!res.ok) {
    throw new Error(data.message || data.error || `PropertyRadar error ${res.status}`);
  }
  const id = data.results?.[0]?.RadarID?.trim();
  return id || null;
}

async function suggestSiteAddress(
  input: string,
  criteria?: PrCriterion[]
): Promise<PrCriterion[] | null> {
  const res = await prFetch("/v1/suggestions/SiteAddress", {
    method: "POST",
    query: { SuggestionInput: input },
    body: JSON.stringify(criteria?.length ? { Criteria: criteria } : {}),
  });
  const data = (await res.json()) as {
    results?: PrSuggestionResult[];
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || data.error || `Suggestion error ${res.status}`);
  }
  const first = data.results?.[0];
  return first?.Criteria?.length ? first.Criteria : null;
}

async function resolveCountyFips(
  county: string,
  state?: string | null
): Promise<string | null> {
  const bodyCriteria: PrCriterion[] = [];
  if (state?.trim()) {
    bodyCriteria.push({ name: "State", value: [state.trim().toUpperCase()] });
  }
  const res = await prFetch("/v1/suggestions/County", {
    method: "POST",
    query: { SuggestionInput: county.trim() },
    body: JSON.stringify(bodyCriteria.length ? { Criteria: bodyCriteria } : {}),
  });
  const data = (await res.json()) as {
    results?: PrSuggestionResult[];
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || data.error || `County suggestion error ${res.status}`);
  }
  const countyCrit = data.results?.[0]?.Criteria?.find((c) => c.name === "County");
  const val = countyCrit?.value;
  if (Array.isArray(val) && val[0] != null) return String(val[0]);
  if (val != null && val !== "") return String(val);
  return null;
}

/**
 * Resolve a parcel to a PropertyRadar RadarID using free RadarID-only exports.
 * Order: street address → APN+county → nearest to lat/lng.
 */
export async function resolvePropertyRadarId(
  input: PropertyRadarInput
): Promise<{ radarId: string; url: string } | null> {
  if (!getApiKey()) {
    throw new Error("PROPERTYRADAR_API_KEY is not configured");
  }

  const address = input.address?.trim() ?? "";
  const apn = input.apn?.trim() ?? "";
  const county = input.county?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  let fips = input.countyFips?.trim() ?? "";

  // 1) Address via SiteAddress suggestions → structured criteria → RadarID
  if (isUsableAddress(address)) {
    const hint: PrCriterion[] = [];
    if (state) hint.push({ name: "State", value: [state.toUpperCase()] });
    const criteria = await suggestSiteAddress(address, hint.length ? hint : undefined);
    if (criteria) {
      const radarId = await searchRadarId(criteria);
      if (radarId) return { radarId, url: buildPropertyRadarDetailUrl(radarId) };
    }
  }

  // 2) APN + county FIPS
  if (apn) {
    if (!fips && county) {
      fips = (await resolveCountyFips(county, state)) ?? "";
    }
    if (fips) {
      const fipsNum = Number(fips);
      const radarId = await searchRadarId([
        { name: "APN", value: [apn] },
        {
          name: "County",
          value: [Number.isFinite(fipsNum) ? fipsNum : fips],
        },
      ]);
      if (radarId) return { radarId, url: buildPropertyRadarDetailUrl(radarId) };
    }
  }

  // 3) Nearest property to coordinates (works well for vacant land)
  if (
    typeof input.lat === "number" &&
    Number.isFinite(input.lat) &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lng)
  ) {
    const radarId = await searchRadarId([
      {
        name: "LimitNearest",
        value: [
          {
            limit: 1,
            type: "current_location",
            latitude: input.lat,
            longitude: input.lng,
            label: "Parcel",
          },
        ],
      },
    ]);
    if (radarId) return { radarId, url: buildPropertyRadarDetailUrl(radarId) };
  }

  return null;
}
