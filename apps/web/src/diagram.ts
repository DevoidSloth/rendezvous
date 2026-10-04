/** Geometry for the line-diagram look: straight runs with rounded corners, like a transit map. */

export type P = [number, number];

/** A path through points with each corner rounded by up to `r`. */
export function roundedPath(points: P[], r = 28): string {
  if (points.length < 2) return "";
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    const l1 = Math.hypot(x1 - x0, y1 - y0);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const a: P = [x1 - ((x1 - x0) / l1) * k, y1 - ((y1 - y0) / l1) * k];
    const b: P = [x1 + ((x2 - x1) / l2) * k, y1 + ((y2 - y1) / l2) * k];
    d += ` L${a[0].toFixed(1)},${a[1].toFixed(1)} Q${x1},${y1} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  const last = points.at(-1)!;
  return `${d} L${last[0]},${last[1]}`;
}

export interface Rider {
  id: string;
  name: string;
  from: string;
  color: string;
  /** Minutes on foot; the line draws over exactly this much of the clock. */
  minutes: number;
  points: P[];
  /** Where the origin label sits relative to the first point. */
  label: "above" | "below" | "left" | "right";
}

/** The demo evening: four friends, one table at Sangam, 7:15 PM. */
export const TABLE: P = [470, 330];
export const ARRIVE = 19 * 60 + 15;

export const RIDERS: Rider[] = [
  { id: "jason", name: "Jason", from: "North Campus", color: "var(--l1)", minutes: 26, label: "below", points: [[70, 60], [300, 60], [470, 230], TABLE] },
  { id: "maya", name: "Maya", from: "Olin Library", color: "var(--l2)", minutes: 10, label: "below", points: [[690, 70], [690, 160], [560, 290], [560, 330], TABLE] },
  { id: "dev", name: "Dev", from: "Duffield Hall", color: "var(--l3)", minutes: 6, label: "below", points: [[680, 600], [600, 600], [470, 470], TABLE] },
  { id: "ana", name: "Ana", from: "The Commons", color: "var(--l4)", minutes: 15, label: "below", points: [[60, 560], [240, 560], [370, 430], [370, 330], TABLE] },
];

export const clockText = (minutes: number) => {
  const m = Math.floor(minutes);
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
};
