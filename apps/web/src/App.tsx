import { useRef } from "react";
import { BRAND } from "./brand";
import { Demo } from "./demo/Demo";
import { Built } from "./sections/Built";
import { Fairness } from "./sections/Fairness";
import { Faq } from "./sections/Faq";
import { Hero, Logo } from "./sections/Hero";
import { Privacy } from "./sections/Privacy";
import { StickyNav } from "./sections/StickyNav";
import { Story } from "./sections/Story";
import { Trunk } from "./sections/Trunk";
import { Watch } from "./sections/Watch";

export function App() {
  const page = useRef<HTMLDivElement>(null);
  return (
    <div className="page" ref={page}>
      <a className="skip" href="#try">
        Skip to the demo
      </a>
      <StickyNav />
      <Hero />
      <main>
        <Watch />
        <Story />
        <Fairness />
        <Demo />
        <Privacy />
        <Built />
        <Faq />
      </main>
      <footer className="footer">
        <div className="footer-arrive">
          <span className="footer-dot" data-trunk-end aria-hidden="true" />
          <p>
            <b>Table for 4 at 7:15.</b> Everyone made it.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#try">
              Plan a dinner here
            </a>
            <a className="btn btn-quiet" href="#watch">
              Watch the video
            </a>
          </div>
        </div>
        <div className="footer-meta">
          <span className="wordmark small">
            <Logo size={22} />
            {BRAND.name}
          </span>
          <span>
            Made at {BRAND.event} in Ithaca, NY. <a href={`https://${BRAND.domain}`}>{BRAND.domain}</a>
          </span>
        </div>
      </footer>
      <Trunk page={page} />
    </div>
  );
}
