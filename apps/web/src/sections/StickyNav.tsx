import { useEffect, useState } from "react";
import { BRAND } from "../brand";
import { Logo } from "./Hero";

type Theme = "auto" | "light" | "dark";
const KEY = "rendezvous-theme";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const STOPS: Array<{ id: string; name: string }> = [
  { id: "watch", name: "Video" },
  { id: "how", name: "How it works" },
  { id: "fair", name: "Why this spot" },
  { id: "try", name: "Try it" },
  { id: "privacy", name: "Privacy" },
  { id: "built", name: "What it runs on" },
  { id: "faq", name: "Questions" },
];
const LABEL: Record<Theme, string> = { auto: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Appears once the hero's own nav scrolls away. */
export function StickyNav() {
  const [shown, setShown] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [at, setAt] = useState(-1);

  // The current stop is the last section whose top has passed 40% of the screen.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.4;
        let i = -1;
        STOPS.forEach((s, k) => {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= line) i = k;
        });
        setAt(i);
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
  }, []);

  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    // Watch only the nav strip at the top of the hero.
    const io = new IntersectionObserver(([e]) => setShown(!e!.isIntersecting && e!.boundingClientRect.top < 0));
    const nav = hero.querySelector(".nav");
    if (nav) io.observe(nav);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice lasts this visit */
    }
  }, [theme]);

  return (
    <div className={`sticky-nav ${shown ? "shown" : ""}`} aria-hidden={!shown} inert={!shown}>
      <nav aria-label="Sections">
        <a href="#top" className="wordmark small">
          <Logo size={22} />
          {BRAND.name}
        </a>
        <ol className="nav-line" style={{ ["--reach" as string]: at < 0 ? 0 : at / (STOPS.length - 1) }}>
          {STOPS.map((s, i) => (
            <li key={s.id} className={`${i === at ? "current" : ""} ${i < at ? "done" : ""}`}>
              <a href={`#${s.id}`} aria-current={i === at ? "location" : undefined}>
                <span className="nav-stop" aria-hidden="true" />
                <span className="nav-stop-name">{s.name}</span>
              </a>
            </li>
          ))}
        </ol>
        <span className="nav-now" aria-hidden="true">
          {STOPS[at]?.name}
        </span>
        <div className="sticky-actions">
          <button className="theme-btn" onClick={() => setTheme(NEXT[theme])} aria-label={`${LABEL[theme]}. Change theme`} title={LABEL[theme]}>
            <ThemeIcon theme={theme} />
          </button>
          <a className="btn btn-primary btn-small" href="#try">
            Try it
          </a>
        </div>
      </nav>
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light")
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </svg>
  );
}
