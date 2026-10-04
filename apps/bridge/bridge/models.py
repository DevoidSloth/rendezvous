"""Request/response models and the in-memory call registry.

The agent server is the source of truth for plans and calls. The bridge only
keeps what it needs to run a live call: the booking details handed over in
``POST /calls`` and a little lifecycle state so that each call reports its
outcome and its end exactly once.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

ResultStatus = Literal["booked", "unavailable", "failed", "no-answer"]
RESULT_STATUSES: tuple[str, ...] = ("booked", "unavailable", "failed", "no-answer")

# The special "to" value that runs the scripted, Twilio-free simulation.
SIMULATE_NUMBER = "simulate"


class CallRequest(BaseModel):
    """Body of ``POST /calls``, sent by the agent server."""

    call_token: str = Field(min_length=8, description="Opaque id the agent server uses for this call")
    to: str = Field(description='Venue phone number in E.164, or "simulate"')
    venue_name: str
    time_text: str = Field(description='Human-readable time, e.g. "7:15 PM tonight"')
    party_size: int = Field(ge=1, le=100)
    reservation_name: str
    callback_number: str
    seating: str | None = None
    accessibility: str | None = None


class CallResponse(BaseModel):
    call_sid: str


@dataclass
class CallState:
    """A booking the bridge is responsible for, keyed by ``call_token``."""

    booking: CallRequest
    call_sid: str | None = None
    created_at: float = field(default_factory=time.time)
    # Set once Twilio opens the media stream; a token can only be used once.
    stream_connected: bool = False
    # Exactly-once guards for the agent server callbacks.
    result_reported: bool = False
    call_ended_sent: bool = False
    # Questions relayed to the group during this call (for logs/debugging).
    questions: list[str] = field(default_factory=list)


class CallRegistry:
    """Process-local registry of active calls.

    A dict is enough here: one bridge process serves a demo's handful of calls,
    and every write happens on the asyncio event loop thread.
    """

    def __init__(self) -> None:
        self._by_token: dict[str, CallState] = {}

    def add(self, booking: CallRequest) -> CallState:
        state = CallState(booking=booking)
        self._by_token[booking.call_token] = state
        return state

    def get(self, call_token: str | None) -> CallState | None:
        if not call_token:
            return None
        return self._by_token.get(call_token)

    def by_sid(self, call_sid: str | None) -> CallState | None:
        if not call_sid:
            return None
        return next((s for s in self._by_token.values() if s.call_sid == call_sid), None)

    def prune(self, max_age_secs: float = 6 * 3600) -> None:
        """Drop calls older than ``max_age_secs`` so the registry stays small."""
        cutoff = time.time() - max_age_secs
        for token in [t for t, s in self._by_token.items() if s.created_at < cutoff]:
            del self._by_token[token]


# Shared by the HTTP routes, the media-stream handler and the simulator.
registry = CallRegistry()
