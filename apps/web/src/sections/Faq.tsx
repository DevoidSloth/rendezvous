import { BRAND } from "../brand";

const QUESTIONS: Array<[string, string]> = [
  [
    "Do my friends need to download anything?",
    `No. Everyone just texts. On the line we used at ${BRAND.event}, each person texts their own ${BRAND.name} number and the agent relays the plan between threads. On a dedicated line it joins a real iMessage group chat.`,
  ],
  [
    "Does it really call the restaurant?",
    "Yes. Grok Voice places the call through Twilio, says it's an AI at the start, and sends any question it can't answer to your chat. For the hackathon demo, every call rings a teammate instead of a real restaurant.",
  ],
  [
    "How does it decide what's fair?",
    "Budgets and opening hours rule places out first. Of what's left, it picks the spot where the longest walk in the group is shortest, then the earliest time everyone is free from the moment they leave until the meal ends.",
  ],
  [
    "Is the money real?",
    "Not yet. Payments run on Capital One's Nessie sandbox, so transfers are recorded between test accounts but no real money moves.",
  ],
  [
    "What if someone never answers?",
    "It says it'll lock the plan in 10 minutes unless someone objects, then goes ahead. After three rounds of changes, the person who asked makes the final pick.",
  ],
  [
    "Can I use it today?",
    `${BRAND.name} is a hackathon project that knows Ithaca restaurants. The demo on this page runs the real planner, so you can try the whole loop there.`,
  ],
];

export function Faq() {
  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="section-head">
        <span className="station-mark" data-station aria-hidden="true" />
        <h2 id="faq-title">Questions people ask</h2>
      </div>
      <div className="faq-list">
        {QUESTIONS.map(([q, a]) => (
          <details key={q}>
            <summary>
              <span>{q}</span>
              <span className="faq-mark" aria-hidden="true" />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
