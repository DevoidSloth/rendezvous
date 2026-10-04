"""End-to-end tests for the bridge HTTP surface and the simulate flow.

Runs the bridge and the stub agent server as real uvicorn servers on free
ports, so the bridge's outbound httpx calls exercise the actual contract.
No Twilio or xAI credentials are needed.
"""

from __future__ import annotations

import os
import socket
import threading
import time
import uuid
from collections.abc import Iterator

import httpx
import pytest
import uvicorn

SECRET = "test-secret"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class _Server(threading.Thread):
    """Run a uvicorn app in a background thread."""

    def __init__(self, app, port: int) -> None:
        super().__init__(daemon=True)
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))

    def run(self) -> None:
        self.server.run()

    def __enter__(self) -> _Server:
        self.start()
        deadline = time.time() + 10
        while not self.server.started:
            if time.time() > deadline:
                raise RuntimeError("server did not start")
            time.sleep(0.05)
        return self

    def __exit__(self, *exc) -> None:
        self.server.should_exit = True
        self.join(timeout=5)


@pytest.fixture(scope="module")
def servers() -> Iterator[tuple[str, str]]:
    stub_port, bridge_port = _free_port(), _free_port()
    os.environ.update(
        {
            "BRIDGE_SECRET": SECRET,
            "AGENT_URL": f"http://127.0.0.1:{stub_port}",
            "SIMULATE_STEP_DELAY_SECS": "0",
            "VALIDATE_TWILIO_SIGNATURE": "false",
            # Make sure a developer's real .env can't place a call from tests.
            "TWILIO_ACCOUNT_SID": "",
            "TWILIO_AUTH_TOKEN": "",
            "PUBLIC_HOST": "",
        }
    )
    from bridge.config import get_settings

    get_settings.cache_clear()

    import tests.stub_agent as stub
    from bridge import server as bridge_server

    stub.SECRET = SECRET
    # The module-level client captured settings at import time; rebuild it.
    bridge_server.agent = bridge_server.AgentClient()

    with _Server(stub.app, stub_port), _Server(bridge_server.app, bridge_port):
        yield f"http://127.0.0.1:{bridge_port}", f"http://127.0.0.1:{stub_port}"


def _booking(**overrides) -> dict:
    body = {
        "call_token": f"tok-{uuid.uuid4().hex}",
        "to": "simulate",
        "venue_name": "Moosewood Restaurant",
        "time_text": "7:15 PM tonight",
        "party_size": 4,
        "reservation_name": "Jason",
        "callback_number": "+16075550123",
        "seating": "booth if possible",
        "accessibility": None,
    }
    body.update(overrides)
    return body


def _events_for(stub_url: str, token: str, until_kind: str = "call_ended", timeout: float = 10) -> list[dict]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        events = [e for e in httpx.get(f"{stub_url}/_events").json() if e["body"].get("call_token") == token]
        if any(e["kind"] == until_kind for e in events):
            return events
        time.sleep(0.1)
    raise AssertionError(f"no {until_kind} for {token}; got {events}")


def test_health(servers):
    bridge_url, _ = servers
    response = httpx.get(f"{bridge_url}/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_calls_requires_secret(servers):
    bridge_url, _ = servers
    assert httpx.post(f"{bridge_url}/calls", json=_booking()).status_code == 401
    bad = httpx.post(f"{bridge_url}/calls", json=_booking(), headers={"X-Bridge-Secret": "nope"})
    assert bad.status_code == 401


def test_real_call_without_twilio_is_rejected(servers):
    bridge_url, _ = servers
    response = httpx.post(
        f"{bridge_url}/calls",
        json=_booking(to="+16075550199"),
        headers={"X-Bridge-Secret": SECRET},
    )
    assert response.status_code == 503


def test_simulate_happy_path(servers):
    bridge_url, stub_url = servers
    httpx.post(f"{stub_url}/_config", json={"mode": "answer"})
    booking = _booking()
    response = httpx.post(f"{bridge_url}/calls", json=booking, headers={"X-Bridge-Secret": SECRET})
    assert response.status_code == 200, response.text
    assert response.json()["call_sid"].startswith("SIM")

    events = _events_for(stub_url, booking["call_token"])
    kinds = [e["kind"] for e in events]
    assert kinds == ["ask_group", "ask_group", "report_result", "call_ended"]

    first, second = events[0]["body"], events[1]["body"]
    assert first["binding"] is False and first["options"] == ["7:30 PM", "8:00 PM"]
    assert second["binding"] is True and second["options"] == ["Yes", "No"]

    result = events[2]["body"]
    assert result["status"] == "booked"
    assert result["time"] == "7:30 PM"
    assert events[3]["body"]["reason"] == "booking confirmed"

    # The same token can't be replayed.
    again = httpx.post(f"{bridge_url}/calls", json=booking, headers={"X-Bridge-Secret": SECRET})
    assert again.status_code == 409


def test_simulate_timeout_path(servers):
    bridge_url, stub_url = servers
    httpx.post(f"{stub_url}/_config", json={"mode": "timeout"})
    try:
        booking = _booking()
        response = httpx.post(f"{bridge_url}/calls", json=booking, headers={"X-Bridge-Secret": SECRET})
        assert response.status_code == 200
        events = _events_for(stub_url, booking["call_token"])
        result = next(e["body"] for e in events if e["kind"] == "report_result")
        # Non-binding question took the safe default; the binding fee was not accepted.
        assert result["status"] == "failed"
        assert "no-show fee" in result["notes"]
    finally:
        httpx.post(f"{stub_url}/_config", json={"mode": "answer"})


def test_twilio_no_answer_status_reports(servers):
    bridge_url, stub_url = servers
    from bridge.models import CallRequest, registry

    booking = _booking(to="+16075550199")
    state = registry.add(CallRequest(**booking))
    state.call_sid = "CA" + uuid.uuid4().hex

    response = httpx.post(
        f"{bridge_url}/twilio/status?call_token={booking['call_token']}",
        data={"CallSid": state.call_sid, "CallStatus": "no-answer"},
    )
    assert response.status_code == 200
    events = _events_for(stub_url, booking["call_token"])
    result = next(e["body"] for e in events if e["kind"] == "report_result")
    assert result["status"] == "no-answer"


def test_prompt_and_twiml():
    from bridge.models import CallRequest
    from bridge.prompts import build_system_prompt
    from bridge.twilio_calls import build_stream_twiml

    booking = CallRequest(**_booking(to="+16075550199"))
    prompt = build_system_prompt(booking)
    assert "AI assistant" in prompt and "booth if possible" in prompt
    assert "6 0 7, 5 5 5, 0 1 2 3" in prompt

    twiml = build_stream_twiml(booking.call_token)
    assert "<Connect><Stream" in twiml
    assert f'<Parameter name="call_token" value="{booking.call_token}"' in twiml
