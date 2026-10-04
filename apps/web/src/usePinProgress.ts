import { useEffect, useState, type RefObject } from "react";

/**
 * How far the page has scrolled through a tall "track" whose child is pinned
 * with position: sticky. 0 when the track's top reaches the top of the
 * viewport, 1 when its bottom reaches the bottom.
 */
export function usePinProgress(track: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = track.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const run = r.height - window.innerHeight;
        setProgress(run <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / run)));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [track]);
  return progress;
}

/** Scrolls so a pinned track shows step `i` of `n`. */
export function scrollToStep(track: HTMLElement, i: number, n: number) {
  const r = track.getBoundingClientRect();
  const run = r.height - window.innerHeight;
  const top = window.scrollY + r.top + (run * (i + 0.5)) / n;
  window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
