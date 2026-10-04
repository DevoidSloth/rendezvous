import type { LatLng, Place } from "./types.ts";

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Offline walking estimate for when the Directions API is unavailable.
 * Streets are not straight lines and Ithaca is hilly, so the straight-line
 * distance is stretched by 1.3 and walked at 75 m per minute.
 */
export function estimateWalkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(2, Math.round((distanceMeters(a, b) * 1.3) / 75));
}

export function directionsLink(dest: LatLng, mode: "walking" | "driving" | "transit" | "bicycling" = "walking"): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat.toFixed(6)},${dest.lng.toFixed(6)}&travelmode=${mode}`;
}

/** Places students name in chat ("I'm at Duffield"). Coordinates are approximate building centers. */
export const KNOWN_PLACES: Array<Place & { aliases: string[] }> = [
  { label: "Duffield Hall", lat: 42.44449, lng: -76.48252, aliases: ["duffield", "eng quad", "engineering quad", "engquad"] },
  { label: "Gates Hall", lat: 42.44494, lng: -76.48095, aliases: ["gates"] },
  { label: "Olin Library", lat: 42.44776, lng: -76.48429, aliases: ["olin", "libe", "arts quad", "uris"] },
  { label: "Willard Straight Hall", lat: 42.44660, lng: -76.48586, aliases: ["the straight", "willard straight", "wsh"] },
  { label: "Robert Purcell Community Center", lat: 42.45618, lng: -76.47748, aliases: ["north campus", "rpcc", "appel", "north"] },
  { label: "Mews Hall", lat: 42.44710, lng: -76.48945, aliases: ["west campus", "west", "mews", "becker", "cook"] },
  { label: "Collegetown", lat: 42.44220, lng: -76.48530, aliases: ["collegetown", "ctown", "college ave", "eddy st", "eddy street"] },
  { label: "Ithaca Commons", lat: 42.43920, lng: -76.49710, aliases: ["the commons", "commons", "downtown"] },
  { label: "Statler Hotel", lat: 42.44569, lng: -76.48223, aliases: ["statler", "hotel school"] },
  { label: "Mann Library", lat: 42.44873, lng: -76.47646, aliases: ["mann", "ag quad"] },
  { label: "Barton Hall", lat: 42.44575, lng: -76.48078, aliases: ["barton"] },
  { label: "Helen Newman Hall", lat: 42.45304, lng: -76.47729, aliases: ["helen newman", "noyes"] },
];

/** Resolves free text like "I'm at Duffield" to a place, or undefined. */
export function resolvePlace(text: string): Place | undefined {
  const t = text.toLowerCase();
  let best: { place: Place; len: number } | undefined;
  for (const p of KNOWN_PLACES) {
    for (const alias of [p.label.toLowerCase(), ...p.aliases]) {
      const re = new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
      if (re.test(t) && (!best || alias.length > best.len)) {
        best = { place: { label: p.label, lat: p.lat, lng: p.lng }, len: alias.length };
      }
    }
  }
  return best?.place;
}
