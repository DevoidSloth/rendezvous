import { useEffect, useRef, useState, type RefObject } from "react";
import { roundedPath, type P } from "../diagram";

/**
 * Four lines, one per friend, that run the length of the page and draw in as
 * you scroll. They stop at each numbered station and meet at the table in the
 * footer. Each line draws at its own pace but they all arrive together.
 */

const COLORS = ["var(--l1)", "var(--l2)", "var(--l3)", "var(--l4)"];
const PACE = [0.82, 1, 1.22, 1.5];
const GAP = 12;

interface Layout {
  width: number;
  height: number;
  start: number;
  end: number;
  paths: string[];
  lengths: number[];
  stations: number[];
  xc: number;
  endPoint: P;
}

export function Trunk({ page }: { page: RefObject<HTMLDivElement | null> }) {
  const [layout, setLayout] = useState<Layout>();
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      const marks = [...root.querySelectorAll<HTMLElement>("[data-station]")];
      const endEl = root.querySelector<HTMLElement>("[data-trunk-end]");
      if (!marks.length || !endEl) return;
      const center = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return [r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2] as P;
      };
      const [xc, firstY] = center(marks[0]!);
      const endPoint = center(endEl);
      const start = firstY - 220;
      const end = endPoint[1];
      const paths = COLORS.map((_, i) => {
        const x = xc + (i - 1.5) * GAP;
        const bend = end - 60 - Math.abs(i - 1.5) * GAP;
        return roundedPath([[x, start], [x, bend], [endPoint[0], end]], 24);
      });
      const lengths = paths.map((d) => {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("d", d);
        return el.getTotalLength();
      });
      setLayout({ width: rect.width, height: root.scrollHeight, start, end, paths, lengths, stations: marks.map((m) => center(m)[1]), xc, endPoint });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", measure);
    };
  }, [page]);

  useEffect(() => {
    if (!layout) return;
    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const root = page.current!;
        const top = root.getBoundingClientRect().top;
        const reach = -top + window.innerHeight * 0.62;
        setProgress(Math.min(1, Math.max(0, (reach - layout.start) / (layout.end - layout.start))));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [layout, page]);

  if (!layout) return null;
  const reachedY = layout.start + progress * (layout.end - layout.start);

  return (
    <svg className="trunk" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
      {layout.paths.map((d, i) => (
        <path key={`ghost-${i}`} d={d} className="trunk-ghost" style={{ stroke: COLORS[i] }} />
      ))}
      {layout.paths.map((d, i) => {
        const p = progress ** PACE[i]!;
        const len = layout.lengths[i]!;
        return <path key={i} d={d} className="trunk-line" style={{ stroke: COLORS[i], strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - p) }} />;
      })}
      {layout.stations.map((y, i) => (
        <rect
          key={i}
          x={layout.xc - 2 * GAP - 6}
          y={y - 11}
          width={4 * GAP + 12}
          height={22}
          rx={11}
          className={`trunk-station ${reachedY >= y ? "reached" : ""}`}
        />
      ))}
      <g transform={`translate(${layout.endPoint[0]} ${layout.endPoint[1]})`} className={`trunk-end ${progress >= 0.999 ? "reached" : ""}`}>
        <circle r="22" className="trunk-end-station" />
        <circle r="11" className="trunk-end-dot" />
      </g>
    </svg>
  );
}
