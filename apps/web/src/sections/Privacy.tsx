import { BRAND } from "../brand";

const RULES: Array<[string, string]> = [
  ["Calendars", "It sees when you're busy, never what you're doing. Event names and guests stay on your calendar."],
  ["Location", "Where you are only feeds the walking math. Nobody else in the plan sees it."],
  ["Balances", "Your balance only rules out places you can't afford. Nobody in the chat ever sees it."],
  ["Payments", "Money moves only when the person who owes taps 👍 on their own line. Anyone else's tap is ignored."],
  ["Phone calls", "It says it's an AI at the start of every call, and it never speaks or stores a card or account number."],
];

export function Privacy() {
  return (
    <section className="privacy" id="privacy" aria-labelledby="privacy-title">
      <div className="section-head">
        <span className="station-mark" data-station aria-hidden="true" />
        <h2 id="privacy-title">It knows just enough</h2>
        <p>{BRAND.name} takes the least it needs for each step, and nothing moves without the right person's say-so.</p>
      </div>
      <dl className="rules">
        {RULES.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
