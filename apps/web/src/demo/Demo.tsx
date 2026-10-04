import { useEffect, useState, useSyncExternalStore } from "react";
import { BRAND } from "../brand";
import { Backstage } from "./Backstage";
import { Phone } from "./Phone";
import { DemoSession } from "./session";

export function Demo() {
  const [session] = useState(() => new DemoSession());
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  return (
    <section className="demo night" id="try" aria-labelledby="try-title">
      <div className="section-head">
        <h2 id="try-title">Now plan one yourself</h2>
        <p>
          This runs the real {BRAND.name} planner in your browser. You're Jason, with three pretend friends, a pretend restaurant and pretend money.
          Type anything, or tap a suggestion.
        </p>
      </div>
      <div className="demo-grid">
        <Phone snap={snap} session={session} />
        <Backstage snap={snap} />
      </div>
    </section>
  );
}
