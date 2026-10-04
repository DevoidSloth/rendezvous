"""Unit tests for the voice tools' control flow (no xAI, Twilio or audio).

The session is built with ``__new__`` so the Pipecat pipeline and the Grok
connection are never created; only the tool handlers are exercised.
"""

from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace

os.environ.setdefault("XAI_API_KEY", "test")

from bridge.agent_client import GroupAnswer  # noqa: E402
from bridge.models import CallRequest, CallState  # noqa: E402
from bridge.prompts import FILLER_LINE  # noqa: E402
from bridge.voice import SpeechTracker, VoiceCallSession  # noqa: E402


class FakeAgent:
    def __init__(self, answer: str | None, delay: float) -> None:
        self.answer, self.delay = answer, delay
        self.asked: list[tuple] = []
        self.reports: list[tuple] = []

    async def ask_group(self, token, question, options, binding):
        self.asked.append((question, options, binding))
        await asyncio.sleep(self.delay)
        return GroupAnswer(answer=self.answer, answered_by="Maya" if self.answer else None,
                           timed_out=self.answer is None)

    async def report_result(self, state, status, time=None, notes=None):
        self.reports.append((status, time, notes))
        state.result_reported = True
        return True


class FakeLLM:
    def __init__(self) -> None:
        self.events = []

    async def send_client_event(self, event) -> None:
        self.events.append(event)


class FakeWorker:
    def __init__(self) -> None:
        self.frames = []

    async def queue_frame(self, frame) -> None:
        self.frames.append(frame)


def _session(agent: FakeAgent) -> VoiceCallSession:
    booking = CallRequest(call_token="tok-unit-0001", to="+15550000000", venue_name="Moosewood",
                          time_text="7:15 PM tonight", party_size=4, reservation_name="Jason",
                          callback_number="+16075550123")
    session = VoiceCallSession.__new__(VoiceCallSession)
    session.state = CallState(booking=booking, call_sid="CAunit")
    session.agent = agent
    session.llm = FakeLLM()
    session.speech = SpeechTracker()
    session.worker = FakeWorker()
    session._filler_interval = 0.05
    session._background = set()
    session._ending = False
    session._end_reason = None
    session.hung_up = False

    async def hang_up() -> None:
        session.hung_up = True

    session._hang_up_fn = hang_up
    return session


def _params(arguments: dict, sink: list) -> SimpleNamespace:
    async def result_callback(result, *, properties=None):
        sink.append((result, properties))

    return SimpleNamespace(arguments=arguments, result_callback=result_callback)


def test_ask_group_fills_silence_and_returns_answer():
    async def scenario():
        agent = FakeAgent(answer="8:00 PM", delay=0.18)
        session = _session(agent)
        results: list = []
        await session._ask_group(_params(
            {"question": "8 or 8:30?", "options": ["8:00 PM", "8:30 PM"], "binding": False}, results))
        return session, agent, results

    session, agent, results = asyncio.run(scenario())
    assert agent.asked == [("8 or 8:30?", ["8:00 PM", "8:30 PM"], False)]
    assert results[0][0] == {"answered": True, "answer": "8:00 PM", "answered_by": "Maya"}
    fillers = [e for e in session.llm.events if e.item.type == "force_message"]
    assert len(fillers) >= 2
    assert fillers[0].item.content[0].text == FILLER_LINE
    assert fillers[0].item.content[0].type == "output_text"


def test_ask_group_timeout_returns_guidance():
    async def scenario():
        session = _session(FakeAgent(answer=None, delay=0.01))
        results: list = []
        await session._ask_group(_params(
            {"question": "Deposit of $20 ok?", "options": ["Yes", "No"], "binding": True}, results))
        return results

    result = asyncio.run(scenario())[0][0]
    assert result["answered"] is False and result["timed_out"] is True
    assert "Never accept a fee" in result["guidance"]


def test_end_call_waits_then_hangs_up():
    async def scenario():
        session = _session(FakeAgent(answer=None, delay=0))
        results: list = []
        await session._end_call(_params({"reason": "booking confirmed"}, results))
        await asyncio.gather(*session._background)
        return session, results

    session, results = asyncio.run(scenario())
    assert results[0][1].run_llm is False
    assert session.hung_up is True
    assert type(session.worker.frames[-1]).__name__ == "EndFrame"
    assert session._end_reason == "booking confirmed"
