# Rendezvous call bridge

This Python service places the venue reservation call (SPEC section 4). It dials the venue through Twilio and streams the call audio to the Grok Voice Agent API through Pipecat 1.12. During the call, the voice agent can relay questions to the group chat through the agent server.

```
agent server --POST /calls--> bridge --Twilio REST--> venue phone
                                 ^  <--WS /ws (media)--  Twilio
                                 |  <--> Grok Voice (wss://api.x.ai/v1/realtime)
agent server <--/bridge/ask_group, report_result, call_ended--+
```

## Setup

```bash
cd apps/bridge
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # or: pip install -e ".[dev]"
cp .env.example .env                   # fill in the values below
```

| Variable | Notes |
| --- | --- |
| `BRIDGE_SECRET` | Must match the agent server. Sent as `X-Bridge-Secret` in both directions. |
| `AGENT_URL` | Agent server base URL. Defaults to `http://localhost:8787`. |
| `XAI_API_KEY`, `GROK_VOICE` | Grok Voice credentials and voice. The voice defaults to `rex`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Twilio credentials and caller number. Trial accounts can only dial verified numbers. |
| `PUBLIC_HOST` | The ngrok host with no scheme, e.g. `abc123.ngrok-free.app`. |

## Run

```bash
ngrok http 8765                        # copy the https host into PUBLIC_HOST
python -m bridge                       # serves on :8765
curl localhost:8765/health
```

The agent server starts a call like this:

```bash
curl -X POST localhost:8765/calls -H "X-Bridge-Secret: $BRIDGE_SECRET" -H 'Content-Type: application/json' \
  -d '{"call_token":"tok-123456","to":"+16075550123","venue_name":"Moosewood","time_text":"7:15 PM tonight",
       "party_size":4,"reservation_name":"Jason","callback_number":"+16075550100","seating":null,"accessibility":null}'
# -> {"call_sid":"CA..."}
```

Twilio dials the venue. When someone answers, Twilio opens `wss://PUBLIC_HOST/ws` with the `call_token` as a stream parameter. The bridge then runs the Grok pipeline:

- The agent discloses that it is an AI assistant and asks for the table.
- It uses `ask_group` for questions it can't answer on its own. Questions about fees, deposits or cancellation policies set `binding: true`.
- While `ask_group` waits, the bridge speaks "Still checking with my party, thanks for your patience" every 15 seconds. It does this in code with Grok `force_message`, not through the prompt.
- The agent calls `report_result` once, says goodbye, then calls `end_call`. The bridge waits for the goodbye audio to finish, then hangs up through the Twilio REST API.
- Twilio sends status callbacks to `POST /twilio/status`. If the line is busy, nobody answers or the call fails, the bridge reports `no-answer` or `failed` and then calls `call_ended`.

## Testing without Twilio

**Simulate mode.** Use `"to": "simulate"` in `POST /calls`. Instead of dialing, the bridge runs a scripted host conversation through the real agent-server contract:

1. `ask_group` with two time options (non-binding)
2. `ask_group` about a $10 no-show fee (binding)
3. `report_result`
4. `call_ended`

The transcript is logged to the bridge console. This mode needs no Twilio or xAI keys, so the agent server can test its long-poll and chat flow end to end.

**Stub agent server.** For working on the bridge alone, run `BRIDGE_SECRET=dev-secret python tests/stub_agent.py`. It listens on :8787 and auto-answers questions. Set `STUB_MODE=timeout` to exercise the timeout path. You can inspect recorded calls at `GET /_events`.

**Tests.** Run `pytest`. The tests start the bridge and the stub on free ports and cover:

- the simulate happy path and the timeout path
- auth
- Twilio status callbacks
- TwiML
- the `ask_group` filler, timeout and `end_call` logic

**Talking to the agent locally.** Run `python -m bridge.dev_call` and play the host through your mic. Wear headphones. In this mode you type the group's answers into the terminal. Add `--agent` to send them to the real agent server instead. Setup:

```bash
brew install portaudio && pip install "pipecat-ai[local]"
```

## Agent-server contract

The bridge calls these endpoints on `AGENT_URL`, each with `X-Bridge-Secret`:

- `POST /bridge/ask_group {call_token, question, options[], binding}` long-polls for about 60 seconds and returns `{answer, answered_by, timed_out}`. The bridge waits up to 75 seconds.
- `POST /bridge/report_result {call_token, status: booked|unavailable|failed|no-answer, time?, notes?}` is sent at most once per call.
- `POST /bridge/call_ended {call_token, reason}` is sent once per call.

## Fallback: ElevenLabs

The spec sets a 2 AM checkpoint for the venue call. If the Grok Voice bridge isn't reliable by then, switch the venue call to an ElevenLabs Conversational AI outbound call through its Twilio integration:

- Configure the same system prompt (`bridge/prompts.py`).
- Configure the same three tools as server webhooks that point at the agent server's `/bridge/*` endpoints.
- Add Grok Imagine invites to keep SpaceX eligibility.

`POST /calls` with `"to": "simulate"` keeps the rest of the demo loop working in the meantime.

## Known limits

- Calls live in an in-memory registry, so restarting the bridge forgets active calls. Run one bridge process.
- If Grok fails to connect or returns a server error mid-call, the bridge reports `failed` and hangs up rather than leaving dead air.
- On python.org builds of Python for macOS, the bridge points `SSL_CERT_FILE` at certifi's CA bundle, so the xAI TLS handshake verifies without running "Install Certificates".
