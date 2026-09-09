export type LatLng = { lat: number; lng: number };

export type MediaRecord = {
  url: string;
  title: string;
  description: string;
  type: "image" | "video";
};

export const CONFIG = {
  GEOJSON_URL: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  GEOJSON_FALLBACK_URL: "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson",
  API_BASE: "https://media-api.markmykevin.workers.dev",
  MAP_CENTER: { lat: 20, lng: 0 },
  INITIAL_ZOOM: 2,
  JOURNAL_LIMIT: 8,
  COUNTRY_MEDIA_LIMIT: 8
};

export const COUNTRY_API_ALIASES: Record<string, string> = {
  "United States of America": "United States",
  "Russian Federation": "Russia",
  "Viet Nam": "Vietnam",
  "Türkiye": "Turkey",
  "Czechia": "Czech Republic",
  "Korea, Republic of": "South Korea"
};

export function getCountryApiName(name: string) {
  return COUNTRY_API_ALIASES[name] || name;
}

export function normalizeString(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function haversineDistance(a: LatLng, b: LatLng) {
  const R = 6371;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function interpolateGreatCircle(start: LatLng, end: LatLng, t: number): LatLng {
  const r = Math.PI / 180;
  const lat1 = start.lat * r, lon1 = start.lng * r;
  const lat2 = end.lat * r, lon2 = end.lng * r;
  const x1 = Math.cos(lat1) * Math.cos(lon1);
  const y1 = Math.cos(lat1) * Math.sin(lon1);
  const z1 = Math.sin(lat1);
  const x2 = Math.cos(lat2) * Math.cos(lon2);
  const y2 = Math.cos(lat2) * Math.sin(lon2);
  const z2 = Math.sin(lat2);
  const dot = Math.max(-1, Math.min(1, x1*x2 + y1*y2 + z1*z2));
  const angle = Math.acos(dot);
  if (Math.abs(angle) < 0.000001) {
    return { lat: start.lat + (end.lat-start.lat)*t, lng: start.lng + (end.lng-start.lng)*t };
  }
  const s = Math.sin(angle);
  const a = Math.sin((1-t)*angle)/s;
  const b = Math.sin(t*angle)/s;
  const x = a*x1+b*x2, y = a*y1+b*y2, z = a*z1+b*z2;
  return {
    lat: Math.atan2(z, Math.sqrt(x*x+y*y))/r,
    lng: Math.atan2(y,x)/r
  };
}

export function extractMediaArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    for (const key of ["data","results","items"]) {
      if (Array.isArray(p[key])) return p[key];
    }
  }
  return [];
}

export function normalizeMedia(item: unknown, requestedType: "image" | "video"): MediaRecord | null {
  if (!item || typeof item !== "object") return null;
  const p = item as Record<string, unknown>;
  const url = p.url || p.downloadUrl || p.src || p.mediaUrl || p.fileUrl;
  if (!url) return null;
  const raw = String(p.type || p.mimeType || url).toLowerCase();
  const type: "image" | "video" =
    /video|mp4|webm|mov/.test(raw) ? "video" :
    /image|jpg|jpeg|png|webp|gif/.test(raw) ? "image" : requestedType;
  return {
    url: String(url),
    title: String(p.title || p.name || p.originalFilename || p.filename || "Untitled Expedition Record"),
    description: String(p.description || p.caption || ""),
    type
  };
}

export async function fetchJson(url: string, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithFallback(urls: string[]) {
  let last: unknown = null;
  for (const url of urls) {
    try { return await fetchJson(url); } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("Unable to retrieve data.");
}

export async function fetchMedia(type: "image" | "video", countryName?: string): Promise<MediaRecord[]> {
  const endpoint = type === "video" ? "/api/videos/random" : "/api/images/random";
  const params = new URLSearchParams({ limit: String(countryName ? CONFIG.COUNTRY_MEDIA_LIMIT : CONFIG.JOURNAL_LIMIT) });
  if (countryName) params.set("country", getCountryApiName(countryName));
  const payload = await fetchJson(`${CONFIG.API_BASE}${endpoint}?${params.toString()}`);
  return extractMediaArray(payload)
    .map((item) => normalizeMedia(item, type))
    .filter((item): item is MediaRecord => Boolean(item));
}

export function uniqueMedia(items: MediaRecord[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
