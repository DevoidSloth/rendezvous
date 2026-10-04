"""Talk to the voice agent through your laptop's mic and speakers (no Twilio).

You play the restaurant host. The agent runs the exact same prompt, tools and
filler logic as a phone call.

    python -m bridge.dev_call                     # group answers typed in this terminal
    python -m bridge.dev_call --agent             # ask_group goes to the real agent server
    python -m bridge.dev_call --venue "Moosewood" --party-size 4 --time "7:15 PM tonight"

Requires XAI_API_KEY and PyAudio:

    brew install portaudio && pip install "pipecat-ai[local]"

Use headphones; otherwise the agent hears itself through the speakers.
"""

from __future__ import annotations

import argparse
import asyncio
import uuid

from loguru import logger

from .agent_client import AgentClient, GroupAnswer
from .models import CallRequest, CallState


class TerminalAgentClient(AgentClient):
    """Stands in for the agent server: you type the group's answers."""

    def __init__(self) -> None:
        super().__init__(base_url="http://offline.invalid", secret="")

    async def ask_group(
        self, call_token: str, question: str, options: list[str], binding: bool
    ) -> GroupAnswer:
        tag = " [BINDING: organizer only]" if binding else ""
        menu = "  ".join(f"{i}) {o}" for i, o in enumerate(options, 1))
        prompt = f"\n>>> GROUP CHAT{tag}: {question}\n    {menu}\n    reply (blank = no reply/timeout): "
        try:
            raw = await asyncio.wait_for(asyncio.to_thread(input, prompt), timeout=60)
        except TimeoutError:
            raw = ""
        raw = raw.strip()
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            raw = options[int(raw) - 1]
        if not raw:
            return GroupAnswer(answer=None, answered_by=None, timed_out=True)
        return GroupAnswer(answer=raw, answered_by="you (terminal)", timed_out=False)

    async def report_result(self, state, status, time=None, notes=None) -> bool:  # type: ignore[override]
        if state.result_reported:
            return False
        state.result_reported = True
        print(f"\n>>> REPORT_RESULT status={status} time={time!r} notes={notes!r}\n")
        return True

    async def call_ended(self, state, reason) -> None:  # type: ignore[override]
        if not state.call_ended_sent:
            state.call_ended_sent = True
            print(f"\n>>> CALL_ENDED reason={reason!r}\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local mic test for the Rendezvous voice agent")
    parser.add_argument("--venue", default="Moosewood Restaurant")
    parser.add_argument("--time", dest="time_text", default="7:15 PM tonight")
    parser.add_argument("--party-size", type=int, default=4)
    parser.add_argument("--name", dest="reservation_name", default="Jason")
    parser.add_argument("--callback", dest="callback_number", default="+16075550123")
    parser.add_argument("--seating", default=None)
    parser.add_argument("--accessibility", default=None)
    parser.add_argument(
        "--agent",
        action="store_true",
        help="send ask_group/report_result to the real agent server at AGENT_URL",
    )
    return parser.parse_args()


async def _main() -> None:
    args = _parse_args()
    try:
        from pipecat.transports.local.audio import LocalAudioTransport, LocalAudioTransportParams
    except Exception as exc:  # PyAudio missing
        raise SystemExit(
            f"Local audio is unavailable ({exc}).\n"
            'Install it with: brew install portaudio && pip install "pipecat-ai[local]"'
        ) from exc

    from .voice import VoiceCallSession

    booking = CallRequest(
        call_token=f"dev-{uuid.uuid4().hex[:12]}",
        to="local-mic",
        venue_name=args.venue,
        time_text=args.time_text,
        party_size=args.party_size,
        reservation_name=args.reservation_name,
        callback_number=args.callback_number,
        seating=args.seating,
        accessibility=args.accessibility,
    )
    state = CallState(booking=booking, call_sid="LOCAL")
    agent = AgentClient() if args.agent else TerminalAgentClient()

    sample_rate = 16000
    transport = LocalAudioTransport(
        LocalAudioTransportParams(audio_in_enabled=True, audio_out_enabled=True)
    )
    session = VoiceCallSession(
        state,
        transport,
        agent=agent,
        sample_rate=sample_rate,
        handle_sigint=True,
        wait_for_client=False,
    )
    logger.info("You are the restaurant host. Speak when the agent greets you. Ctrl+C to quit.")
    await session.run()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
