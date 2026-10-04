import { useRef } from "react";
import { BRAND } from "./brand";
import { Demo } from "./demo/Demo";
import { Built } from "./sections/Built";
import { Hero, Logo } from "./sections/Hero";
import { Privacy } from "./sections/Privacy";
import { Story } from "./sections/Story";
import { Trunk } from "./sections/Trunk";

export function App() {
  const page = useRef<HTMLDivElement>(null);
  return (
    <div className="page" ref={page}>
      <a className="skip" href="#try">
        Skip to the demo
      </a>
      <Hero />
      <main>
        <Story />
        <Demo />
        <Privacy />
        <Built />
      </main>
      <footer className="footer">
        <div className="footer-arrive">
          <span className="footer-dot" data-trunk-end aria-hidden="true" />
          <p>
            <b>Table for 4 at 7:15.</b> Everyone made it.
          </p>
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
