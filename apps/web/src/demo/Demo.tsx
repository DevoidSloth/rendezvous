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
    <section className="demo" id="try" aria-labelledby="try-title">
      <div className="section-head">
        <h2 id="try-title">Plan a dinner from this page</h2>
        <p>
          This is the real {BRAND.name} planner and conversation engine, running in your browser with a pretend group, a pretend restaurant and
          pretend money. Type anything, or tap a suggestion.
        </p>
      </div>
      <div className="demo-grid">
        <Phone snap={snap} session={session} />
        <Backstage snap={snap} />
      </div>
    </section>
  );
}
