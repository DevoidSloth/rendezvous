import { distanceMeters, type LatLng } from "@rendezvous/core";

/**
 * A stylized trail map of Ithaca: the south tip of Cayuga Lake, the three
 * gorges, the downtown grid and the climb up East Hill to campus. Coordinates
 * are real (approximate); the drawing is ours.
 */

export const BOUNDS = { north: 42.459, south: 42.4355, west: -76.5045, east: -76.4725 };
export const SIZE = { w: 1000, h: 1000 };

type Pt = [lng: number, lat: number];

export function project(p: LatLng | Pt): [number, number] {
  const lng = Array.isArray(p) ? p[0] : p.lng;
  const lat = Array.isArray(p) ? p[1] : p.lat;
  return [((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * SIZE.w, ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * SIZE.h];
}

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(points: Array<[number, number]>, tension = 0.5): string {
  if (points.length < 2) return "";
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const t = tension / 3;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const line = (pts: Pt[]) => smoothPath(pts.map((p) => project(p)), 0.35);

export const LAKE = (() => {
  const pts: Pt[] = [
    [-76.5045, 42.459],
    [-76.4985, 42.459],
    [-76.4989, 42.4578],
    [-76.5004, 42.4566],
    [-76.5022, 42.4556],
    [-76.5045, 42.4551],
  ];
  return `${line(pts)} L${project([-76.5045, 42.459]).join(",")} Z`;
})();

export const BEEBE = { c: project([-76.4778, 42.4513]), rx: 17, ry: 7 };

export const CREEKS = [
  {
    name: "Fall Creek",
    d: line([
      [-76.4725, 42.4529],
      [-76.4762, 42.4517],
      [-76.4795, 42.4512],
      [-76.4835, 42.4521],
      [-76.4868, 42.4519],
      [-76.4903, 42.4504],
      [-76.4945, 42.4497],
      [-76.4974, 42.452],
      [-76.4998, 42.4562],
    ]),
    label: { at: project([-76.4925, 42.4508]), rotate: -6 },
  },
  {
    name: "Cascadilla Creek",
    d: line([
      [-76.4725, 42.4449],
      [-76.4782, 42.4443],
      [-76.4818, 42.444],
      [-76.4846, 42.4436],
      [-76.488, 42.4426],
      [-76.4915, 42.4415],
      [-76.496, 42.441],
      [-76.5, 42.4419],
      [-76.5034, 42.4428],
    ]),
    label: { at: project([-76.4948, 42.4417]), rotate: 2 },
  },
  {
    name: "Six Mile Creek",
    d: line([
      [-76.4795, 42.4355],
      [-76.4868, 42.4366],
      [-76.4921, 42.4371],
      [-76.4972, 42.4369],
      [-76.5034, 42.4377],
    ]),
    label: { at: project([-76.4905, 42.4362]), rotate: -3 },
  },
  {
    name: "Cayuga Inlet",
    d: line([
      [-76.5036, 42.4355],
      [-76.5034, 42.445],
      [-76.5031, 42.4555],
    ]),
    label: undefined,
  },
];

export const STREETS: string[] = [
  // Downtown grid, east–west
  [[-76.5034, 42.4382], [-76.4935, 42.4382]],
  [[-76.5034, 42.4392], [-76.4925, 42.4394], [-76.489, 42.4396], [-76.4862, 42.4399]],
  [[-76.5034, 42.4402], [-76.4885, 42.4406]],
  [[-76.5034, 42.4413], [-76.4945, 42.4416]],
  [[-76.5034, 42.4425], [-76.4935, 42.4428]],
  // Downtown grid, north–south
  [[-76.5006, 42.437], [-76.5006, 42.4445]],
  [[-76.4985, 42.437], [-76.4985, 42.4445]],
  [[-76.497, 42.437], [-76.497, 42.4445]],
  [[-76.4958, 42.437], [-76.4958, 42.444]],
  // Collegetown
  [[-76.4855, 42.437], [-76.4855, 42.4437], [-76.4858, 42.447]],
  [[-76.4865, 42.4392], [-76.4863, 42.4431]],
  [[-76.4855, 42.442], [-76.479, 42.4418], [-76.4725, 42.4408]],
  [[-76.4855, 42.4405], [-76.4815, 42.4405]],
  // Hill and campus
  [[-76.4952, 42.4442], [-76.4905, 42.4462], [-76.4872, 42.4486], [-76.4858, 42.4492]],
  [[-76.4893, 42.44], [-76.4882, 42.444], [-76.4876, 42.4474]],
  [[-76.4885, 42.4451], [-76.4842, 42.4449], [-76.479, 42.4449], [-76.4725, 42.4458]],
  [[-76.4806, 42.4438], [-76.4802, 42.4506]],
  [[-76.4858, 42.4492], [-76.4842, 42.453], [-76.479, 42.4562], [-76.4745, 42.4585]],
  [[-76.479, 42.4508], [-76.479, 42.459]],
].map((s) => line(s as Pt[]));

/** Contour lines for East Hill: elevation climbs from downtown to campus. */
export const CONTOURS: string[] = (() => {
  const out: string[] = [];
  const steps = [0.0, 0.11, 0.21, 0.3, 0.38, 0.45, 0.52, 0.6, 0.7, 0.83];
  steps.forEach((s, i) => {
    const baseLng = -76.4958 + s * 0.0125;
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 24; k++) {
      const lat = BOUNDS.south + (k / 24) * (BOUNDS.north - BOUNDS.south);
      const wobble = Math.sin(k * 0.7 + i * 1.3) * 0.00042 + Math.sin(k * 0.23 + i) * 0.0009;
      // Gorges pull the contours upstream where creeks cut the hill.
      const gorge = Math.exp(-(((lat - 42.4512) / 0.0012) ** 2)) * 0.0016 + Math.exp(-(((lat - 42.4432) / 0.0009) ** 2)) * 0.0011;
      // The hill bends east as it heads north toward the lake.
      const bend = (lat - BOUNDS.south) * 0.12;
      pts.push(project([baseLng + wobble + gorge + bend, lat]));
    }
    out.push(smoothPath(pts, 0.5));
  });
  return out;
})();

export const LABELS: Array<{ text: string; at: [number, number]; kind: "water" | "place" | "area"; rotate?: number }> = [
  { text: "Cayuga Lake", at: project([-76.5036, 42.4579]), kind: "water" },
  { text: "Beebe Lake", at: project([-76.4778, 42.4527]), kind: "water" },
  { text: "North Campus", at: project([-76.4762, 42.4578]), kind: "area" },
  { text: "Arts Quad", at: project([-76.4836, 42.4489]), kind: "area" },
  { text: "Engineering Quad", at: project([-76.4805, 42.4431]), kind: "area" },
  { text: "Collegetown", at: project([-76.4836, 42.4397]), kind: "area" },
  { text: "The Commons", at: project([-76.4966, 42.4384]), kind: "area" },
  { text: "Downtown", at: project([-76.5012, 42.4437]), kind: "area" },
  { text: "East Hill", at: project([-76.4912, 42.4455]), kind: "place", rotate: -62 },
];

export interface HeroWalker {
  id: string;
  name: string;
  from: string;
  color: string;
  path: Pt[];
}

export const HERO_DEST = { name: "Sangam Indian Cuisine", short: "Sangam", at: { lng: -76.4859, lat: 42.44195 } };

export const HERO_WALKERS: HeroWalker[] = [
  {
    id: "jason",
    name: "Jason",
    from: "North Campus",
    color: "var(--f1)",
    path: [
      [-76.4772, 42.4563],
      [-76.4789, 42.4547],
      [-76.479, 42.4516],
      [-76.4801, 42.4499],
      [-76.4804, 42.4462],
      [-76.4821, 42.4449],
      [-76.4843, 42.4441],
      [-76.4855, 42.443],
      [-76.4861, 42.4421],
      [-76.4859, 42.44195],
    ],
  },
  {
    id: "maya",
    name: "Maya",
    from: "Olin Library",
    color: "var(--f2)",
    path: [
      [-76.4843, 42.4478],
      [-76.4857, 42.4469],
      [-76.4858, 42.4454],
      [-76.4855, 42.4438],
      [-76.4856, 42.4426],
      [-76.4859, 42.44195],
    ],
  },
  {
    id: "dev",
    name: "Dev",
    from: "Duffield Hall",
    color: "var(--f3)",
    path: [
      [-76.4825, 42.4445],
      [-76.4839, 42.4442],
      [-76.4851, 42.4435],
      [-76.4857, 42.4426],
      [-76.4859, 42.44195],
    ],
  },
  {
    id: "ana",
    name: "Ana",
    from: "The Commons",
    color: "var(--f4)",
    path: [
      [-76.4971, 42.4392],
      [-76.4935, 42.4393],
      [-76.4893, 42.4396],
      [-76.4864, 42.44],
      [-76.4863, 42.4412],
      [-76.4859, 42.44195],
    ],
  },
];

export function pathMeters(path: Pt[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) {
    m += distanceMeters({ lng: path[i - 1]![0], lat: path[i - 1]![1] }, { lng: path[i]![0], lat: path[i]![1] });
  }
  return m;
}

/** Walking pace on the hill, matching the planner's estimate. */
export const walkMinutes = (path: Pt[]) => Math.max(2, Math.round(pathMeters(path) / 72));

export const pathD = (path: Pt[]) => smoothPath(path.map((p) => project(p)), 0.4);

/** A gentle arc between two points, for routes the demo hasn't hand-drawn. */
export function arcD(a: LatLng, b: LatLng, bend = 0.18): string {
  const [x1, y1] = project(a);
  const [x2, y2] = project(b);
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
