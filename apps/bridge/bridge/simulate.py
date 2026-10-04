"""Scripted, text-only venue call for testing the agent server without Twilio.

``POST /calls`` with ``"to": "simulate"`` runs this instead of dialing. It plays
a fixed host script and drives the real agent-server contract:

1. Host offers two alternate times    -> ``ask_group`` (binding=false, 2 options)
2. Host mentions a no-show fee        -> ``ask_group`` (binding=true, Yes/No)
3. Outcome                            -> ``report_result``
4. Hang up                            -> ``call_ended``

The transcript is logged so you can follow along in the bridge console.
Neither xAI nor Twilio credentials are needed.
"""

from __future__ import annotations

import asyncio
import os
import uuid

from loguru import logger

from .agent_client import AgentClient, GroupAnswer
from .models import CallState
from .prompts import FILLER_LINE

_YES_PREFIXES = ("1", "y", "ok", "sure", "fine", "go ahead", "👍", "liked")


def _is_yes(answer: str) -> bool:
    """Treat "1", "yes", "ok", a thumbs-up tapback, etc. as agreement."""
    return answer.strip().lower().startswith(_YES_PREFIXES)


def new_sim_call_sid() -> str:
    """Twilio-shaped id so downstream code can treat it like a real call SID."""
    return "SIM" + uuid.uuid4().hex[:31]


def _step_delay() -> float:
    try:
        return float(os.getenv("SIMULATE_STEP_DELAY_SECS", "1"))
    except ValueError:
        return 1.0


def _pick_option(answer: str, options: list[str]) -> str | None:
    """Map a group reply ("1", "8:30", "the second one") onto one of ``options``."""
    text = answer.strip().lower()
    if text.isdigit() and 1 <= int(text) <= len(options):
        return options[int(text) - 1]
    for option in options:
        if option.lower() in text or text in option.lower():
            return option
    return None


class SimulatedCall:
    """Plays the host script against the agent server."""

    def __init__(self, state: CallState, agent: AgentClient | None = None) -> None:
        self.state = state
        self.agent = agent or AgentClient()
        self.delay = _step_delay()
        self.token = state.booking.call_token

    def _say(self, who: str, line: str) -> None:
        logger.info(f"[sim {self.token}] {who}: {line}")

    async def _ask(self, question: str, options: list[str], binding: bool) -> GroupAnswer:
        """ask_group with the same 15s filler cadence the voice agent uses."""
        self._say("agent", "Let me check with my group, one moment.")

        async def filler() -> None:
            while True:
                await asyncio.sleep(15)
                self._say("agent", FILLER_LINE)

        filler_task = asyncio.create_task(filler())
        try:
            return await self.agent.ask_group(self.token, question, options, binding)
        finally:
            filler_task.cancel()

    async def run(self) -> None:
        booking = self.state.booking
        reason = "completed"
        try:
            await asyncio.sleep(self.delay)
            self._say("host", f"Thanks for calling {booking.venue_name}, how can I help?")
            self._say(
                "agent",
                f"Hi, this is Rendezvous, an AI assistant calling on behalf of a group. I'd like a "
                f"table for {booking.party_size} at {booking.time_text} under {booking.reservation_name}.",
            )
            await asyncio.sleep(self.delay)

            # 1) Non-binding preference: first reply from anyone wins.
            times = ["7:30 PM", "8:00 PM"]
            self._say("host", f"We're full then, but I can do {times[0]} or {times[1]}.")
            reply = await self._ask(
                f"{booking.venue_name} is full at {booking.time_text}. They can do {times[0]} or "
                f"{times[1]}. Which works?",
                times,
                binding=False,
            )
            chosen = _pick_option(reply.answer, times) if reply.answer else None
            if chosen is None:
                # Safe default on timeout: the time closest to the original ask.
                chosen = times[0]
                self._say("agent", f"No reply yet, so taking the closest time: {chosen}.")
            else:
                self._say("agent", f"{chosen} works great.")
            await asyncio.sleep(self.delay)

            # 2) Binding term: only the organizer's reply counts (server-side).
            self._say("host", "For parties your size there's a $10 per person no-show fee. Is that okay?")
            reply = await self._ask(
                "They charge a $10/person no-show fee for this booking. OK to agree?",
                ["Yes", "No"],
                binding=True,
            )
            if reply.answer is None:
                self._say("agent", "I'll confirm with my group and call you back. Thank you!")
                await self.agent.report_result(
                    self.state,
                    "failed",
                    notes="Group did not confirm the $10/person no-show fee in time; call back to finish.",
                )
                reason = "awaiting_group_on_fee"
            elif _is_yes(reply.answer):
                self._say("agent", "That's fine, please go ahead and book it.")
                await asyncio.sleep(self.delay)
                self._say("host", f"You're all set for {chosen}.")
                await self.agent.report_result(
                    self.state,
                    "booked",
                    time=chosen,
                    notes=f"Party of {booking.party_size} under {booking.reservation_name}. "
                    f"$10/person no-show fee accepted by {reply.answered_by or 'the organizer'}.",
                )
                reason = "booking confirmed"
            else:
                self._say("agent", "We'll pass on the fee, thanks anyway.")
                await self.agent.report_result(
                    self.state,
                    "unavailable",
                    notes="Venue requires a $10/person no-show fee; the group declined.",
                )
                reason = "group declined fee"

            self._say("agent", "Thanks so much, have a great night!")
        except Exception as exc:
            logger.exception(f"[sim {self.token}] simulation crashed")
            await self.agent.report_result(self.state, "failed", notes=f"Simulation error: {exc}")
            reason = "error"
        finally:
            await self.agent.call_ended(self.state, reason)
