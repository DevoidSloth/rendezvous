import { BRAND } from "../brand";

const PARTS: Array<{ name: string; job: string }> = [
  { name: "Photon", job: "The whole interface: iMessage threads and group chats, tapback approvals and departure texts." },
  { name: "Grok", job: "Reads what the group asks for, and Grok Voice places the reservation call." },
  { name: "Capital One Nessie", job: "Ithaca restaurants as merchants, budgets from balances, and the transfers that settle the bill." },
  { name: "Google Maps and Calendar", job: "Walking times for every route, and free/busy for every calendar." },
  { name: "Twilio and Pipecat", job: "Bridge the restaurant's phone line to the voice agent." },
  { name: "GoDaddy Registry", job: `${BRAND.domain}, because it's a table for us.` },
];

export function Built() {
  return (
    <section className="built" id="built" aria-labelledby="built-title">
      <div className="section-head">
        <h2 id="built-title">What it runs on</h2>
        <p>
          One agent server holds the plan and talks to the group through Photon. A separate Python bridge handles the phone audio. Built in Cursor
          at {BRAND.event}.
        </p>
      </div>
      <ul className="parts">
        {PARTS.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b>
            <span>{p.job}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
