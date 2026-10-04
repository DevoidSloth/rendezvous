import { useId, type ReactNode } from "react";
import { BEEBE, CONTOURS, CREEKS, LABELS, LAKE, SIZE, STREETS, project } from "./ithaca";
import type { LatLng } from "@rendezvous/core";

export interface MapRoute {
  id: string;
  d: string;
  color: string;
  /** 0 → nothing drawn, 1 → full route. */
  progress: number;
  /** Where the walker currently is, in map units. */
  at?: [number, number];
  label?: string;
  /** Where the route starts, marked even after the walker leaves. */
  origin?: [number, number];
  /** Pixel length of the path, needed for the draw-on effect. */
  length?: number;
  dim?: boolean;
}

interface Props {
  routes: MapRoute[];
  destination?: { at: LatLng; label?: string; arrived?: boolean };
  /** Crop to a region in map units: [x, y, w, h]. */
  view?: [number, number, number, number];
  children?: ReactNode;
  className?: string;
  title: string;
}

export function IthacaMap({ routes, destination, view, children, className, title }: Props) {
  const uid = useId().replace(/:/g, "");
  const vb = view ?? [0, 0, SIZE.w, SIZE.h];
  const dest = destination ? project(destination.at) : undefined;
  // Labels and markers scale with the crop so they read the same at any zoom.
  const k = vb[2] / SIZE.w;

  return (
    <svg className={`map ${className ?? ""}`} viewBox={vb.join(" ")} role="img" aria-label={title} preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={`hatch-${uid}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="9" className="map-hatch" />
        </pattern>
      </defs>

      <rect x="-50" y="-50" width={SIZE.w + 100} height={SIZE.h + 100} className="map-paper" />

      <g className="map-contours">
        {CONTOURS.map((d, i) => (
          <path key={i} d={d} className={i % 4 === 3 ? "index" : undefined} />
        ))}
      </g>

      <g className="map-streets">
        {STREETS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      <path d={LAKE} className="map-lake" />
      <path d={LAKE} fill={`url(#hatch-${uid})`} />
      <ellipse cx={BEEBE.c[0]} cy={BEEBE.c[1]} rx={BEEBE.rx} ry={BEEBE.ry} className="map-lake" />
      <g className="map-creeks">
        {CREEKS.map((c) => (
          <path key={c.name} d={c.d} />
        ))}
      </g>

      <g className="map-labels" style={{ fontSize: 20 * Math.max(k, 0.5) }}>
        {CREEKS.filter((c) => c.label).map((c) => (
          <text key={c.name} x={c.label!.at[0]} y={c.label!.at[1] - 8} className="water" transform={`rotate(${c.label!.rotate} ${c.label!.at[0]} ${c.label!.at[1]})`}>
            {c.name}
          </text>
        ))}
        {LABELS.map((l) => (
          <text
            key={l.text}
            x={l.at[0]}
            y={l.at[1]}
            className={l.kind}
            transform={l.rotate ? `rotate(${l.rotate} ${l.at[0]} ${l.at[1]})` : undefined}
          >
            {l.text}
          </text>
        ))}
      </g>

      <g className="map-routes">
        {routes.map((r) => (
          <g key={r.id} style={{ color: r.color }} className={r.dim ? "dim" : undefined}>
            <path d={r.d} className="route-ghost" style={{ strokeWidth: 3 * Math.max(k, 0.5) }} />
            {r.origin && <circle cx={r.origin[0]} cy={r.origin[1]} r={7 * Math.max(k, 0.5)} className="route-origin" />}
            <path
              d={r.d}
              className="route-trail"
              style={{
                strokeWidth: 6 * Math.max(k, 0.5),
                strokeDasharray: r.length ? `${r.length} ${r.length}` : undefined,
                strokeDashoffset: r.length ? r.length * (1 - r.progress) : undefined,
              }}
            />
          </g>
        ))}
      </g>

      {dest && (
        <g className={`map-dest ${destination?.arrived ? "arrived" : ""}`} transform={`translate(${dest[0]} ${dest[1]}) scale(${Math.max(k, 0.45)})`}>
          <circle r="34" className="dest-ring" />
          <circle r="15" className="dest-dot" />
          <circle r="5" className="dest-core" />
        </g>
      )}

      <g className="map-walkers">
        {routes
          .filter((r) => r.at)
          .map((r) => (
            <g key={r.id} transform={`translate(${r.at![0]} ${r.at![1]}) scale(${Math.max(k, 0.5)})`} style={{ color: r.color }} className={r.dim ? "dim" : undefined}>
              <circle r="11" className="walker" />
              {r.label && (
                <text x="17" y="5" className="walker-label">
                  {r.label}
                </text>
              )}
            </g>
          ))}
      </g>

      {children}
    </svg>
  );
}
