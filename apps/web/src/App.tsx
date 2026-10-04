import { BRAND } from "./brand";
import { Demo } from "./demo/Demo";
import { Built } from "./sections/Built";
import { Hero, Logo } from "./sections/Hero";
import { Privacy } from "./sections/Privacy";

export function App() {
  return (
    <>
      <a className="skip" href="#try">
        Skip to the demo
      </a>
      <Hero />
      <main>
        <Demo />
        <Privacy />
        <Built />
      </main>
      <footer className="footer">
        <span className="wordmark small">
          <Logo size={20} />
          {BRAND.name}
        </span>
        <span>
          Made at {BRAND.event}, Ithaca, NY. <a href={`https://${BRAND.domain}`}>{BRAND.domain}</a>
        </span>
      </footer>
    </>
  );
}
