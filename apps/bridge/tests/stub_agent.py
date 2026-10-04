"""Tiny stand-in for the TypeScript agent server's ``/bridge/*`` endpoints.

Used by the test-suite, and handy for poking the bridge by hand:

    python tests/stub_agent.py            # listens on :8787
    STUB_MODE=timeout python tests/stub_agent.py

Modes (``STUB_MODE`` env, or ``POST /_config {"mode": ...}``):

- ``answer``  (default) reply "1" to multiple-choice questions and "yes" to
  binding ones, after ``STUB_ANSWER_DELAY`` seconds.
- ``timeout`` hold the long-poll for ``STUB_TIMEOUT_SECS`` then report timed_out.

Every request is recorded and visible at ``GET /_events``.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request

SECRET = os.getenv("BRIDGE_SECRET", "dev-secret")

app = FastAPI(title="Rendezvous agent stub")
app.state.events = []
app.state.mode = os.getenv("STUB_MODE", "answer")
app.state.answer_delay = float(os.getenv("STUB_ANSWER_DELAY", "0.2"))
app.state.timeout_secs = float(os.getenv("STUB_TIMEOUT_SECS", "1"))


def _check(secret: str | None) -> None:
    if secret != SECRET:
        raise HTTPException(401, "bad X-Bridge-Secret")


async def _record(kind: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    app.state.events.append({"kind": kind, "body": body})
    return body


@app.post("/bridge/ask_group")
async def ask_group(request: Request, x_bridge_secret: str | None = Header(default=None)):
    _check(x_bridge_secret)
    body = await _record("ask_group", request)
    if app.state.mode == "timeout":
        await asyncio.sleep(app.state.timeout_secs)
        return {"answer": None, "answered_by": None, "timed_out": True}
    await asyncio.sleep(app.state.answer_delay)
    answer = "yes" if body.get("binding") else "1"
    who = "Organizer" if body.get("binding") else "Maya"
    return {"answer": answer, "answered_by": who, "timed_out": False}


@app.post("/bridge/report_result")
async def report_result(request: Request, x_bridge_secret: str | None = Header(default=None)):
    _check(x_bridge_secret)
    await _record("report_result", request)
    return {"ok": True}


@app.post("/bridge/call_ended")
async def call_ended(request: Request, x_bridge_secret: str | None = Header(default=None)):
    _check(x_bridge_secret)
    await _record("call_ended", request)
    return {"ok": True}


@app.get("/_events")
async def events() -> list[dict[str, Any]]:
    return app.state.events


@app.post("/_config")
async def configure(request: Request) -> dict[str, Any]:
    body = await request.json()
    if "mode" in body:
        app.state.mode = body["mode"]
    if body.get("reset"):
        app.state.events.clear()
    return {"mode": app.state.mode}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("STUB_PORT", "8787")))
