"""FastAPI app: the bridge's HTTP and WebSocket surface.

Routes
------
``POST /calls``          (agent server -> bridge, X-Bridge-Secret) place a call
``WS   /ws``             (Twilio) bidirectional media stream for a placed call
``POST /twilio/status``  (Twilio) call status callbacks: busy / no-answer / failed
``GET  /health``         liveness and configuration check
"""

from __future__ import annotations

import asyncio
import hmac
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, status
from fastapi.responses import JSONResponse
from loguru import logger
from twilio.request_validator import RequestValidator

from . import __version__
from .agent_client import AgentClient
from .config import get_settings
from .models import SIMULATE_NUMBER, CallRequest, CallResponse, registry
from .simulate import SimulatedCall, new_sim_call_sid
from .twilio_calls import TwilioNotConfigured, hang_up, place_call

agent = AgentClient()

# Strong references to fire-and-forget tasks so they aren't garbage collected.
_background: set[asyncio.Task[Any]] = set()


def _spawn(coro: Awaitable[Any]) -> None:
    task = asyncio.ensure_future(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


def require_bridge_secret(x_bridge_secret: str | None = Header(default=None)) -> None:
    """Reject requests that don't carry the shared secret."""
    expected = get_settings().bridge_secret
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "BRIDGE_SECRET is not configured")
    if not x_bridge_secret or not hmac.compare_digest(x_bridge_secret, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid X-Bridge-Secret")


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info(
        f"Bridge {__version__} on :{settings.port} | agent={settings.agent_url} | "
        f"twilio={'yes' if settings.twilio_configured else 'no'} | "
        f"xai={'yes' if settings.xai_api_key else 'no'} | public_host={settings.public_host or '-'}"
    )
    if not settings.bridge_secret:
        logger.warning("BRIDGE_SECRET is empty: POST /calls will be rejected until it is set")
    yield


app = FastAPI(title="Rendezvous call bridge", version=__version__, lifespan=_lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    settings = get_settings()
    return {
        "ok": True,
        "version": __version__,
        "twilio_configured": settings.twilio_configured,
        "xai_configured": bool(settings.xai_api_key),
        "agent_url": settings.agent_url,
    }


@app.post("/calls", response_model=CallResponse, dependencies=[Depends(require_bridge_secret)])
async def create_call(booking: CallRequest) -> CallResponse:
    """Place the reservation call (or start a simulation) for ``booking``."""
    registry.prune()
    if registry.get(booking.call_token) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "call_token already used")

    if booking.to.strip().lower() == SIMULATE_NUMBER:
        state = registry.add(booking)
        state.call_sid = new_sim_call_sid()
        logger.info(f"Starting simulated call {state.call_sid} for {booking.call_token}")
        _spawn(SimulatedCall(state, agent).run())
        return CallResponse(call_sid=state.call_sid)

    settings = get_settings()
    if not settings.xai_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "XAI_API_KEY is not configured")

    state = registry.add(booking)
    try:
        state.call_sid = await place_call(booking)
    except TwilioNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except Exception as exc:
        logger.exception(f"Twilio rejected call for {booking.call_token}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Twilio error: {exc}") from exc
    return CallResponse(call_sid=state.call_sid)


@app.websocket("/ws")
async def media_stream(websocket: WebSocket) -> None:
    """Twilio media stream for an answered call: run the Grok Voice pipeline."""
    # Imported lazily so the HTTP surface (and simulate mode) loads fast and
    # works even if the voice stack is misconfigured.
    from pipecat.runner.utils import parse_telephony_websocket
    from pipecat.serializers.twilio import TwilioFrameSerializer
    from pipecat.transports.websocket.fastapi import (
        FastAPIWebsocketParams,
        FastAPIWebsocketTransport,
    )

    from .voice import VoiceCallSession

    await websocket.accept()
    try:
        transport_type, call_data = await parse_telephony_websocket(websocket)
    except ValueError as exc:
        logger.warning(f"Media stream closed before handshake: {exc}")
        return

    body = call_data.get("body") or {}
    call_token = body.get("call_token")
    call_sid = call_data.get("call_id")
    stream_sid = call_data.get("stream_id")
    state = registry.get(call_token)

    if transport_type != "twilio" or state is None or state.stream_connected:
        logger.warning(
            f"Rejecting media stream (type={transport_type}, token={call_token!r}, "
            f"known={state is not None})"
        )
        await websocket.close(code=1008)
        return

    state.stream_connected = True
    state.call_sid = call_sid or state.call_sid
    logger.info(f"Media stream {stream_sid} up for {call_token} (call {call_sid})")

    settings = get_settings()
    serializer = TwilioFrameSerializer(
        stream_sid=stream_sid,
        call_sid=call_sid,
        account_sid=settings.twilio_account_sid,
        auth_token=settings.twilio_auth_token,
        params=TwilioFrameSerializer.InputParams(twilio_sample_rate=8000, auto_hang_up=True),
    )
    transport = FastAPIWebsocketTransport(
        websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    async def _hang_up() -> None:
        if state.call_sid:
            await hang_up(state.call_sid)

    try:
        session = VoiceCallSession(state, transport, hang_up=_hang_up, agent=agent)
    except Exception as exc:
        logger.exception("Could not start voice session")
        await agent.report_result(state, "failed", notes=f"Voice agent failed to start: {exc}")
        await agent.call_ended(state, "error")
        await _hang_up()
        return

    await session.run()


# Twilio CallStatus values that mean the venue never got on the line.
_UNANSWERED: dict[str, tuple[str, str]] = {
    "busy": ("no-answer", "Line was busy"),
    "no-answer": ("no-answer", "Nobody picked up"),
    "failed": ("failed", "Call could not be connected"),
    "canceled": ("failed", "Call was canceled before it connected"),
}


@app.post("/twilio/status")
async def twilio_status(request: Request) -> JSONResponse:
    """Twilio status callback: report calls that never reach the voice agent."""
    settings = get_settings()
    form = dict(await request.form())
    params = {k: str(v) for k, v in form.items()}

    if settings.validate_twilio_signature:
        # Twilio signs the exact callback URL we gave it (public host + query).
        url = f"https://{settings.public_host}{request.url.path}"
        if request.url.query:
            url += f"?{request.url.query}"
        signature = request.headers.get("X-Twilio-Signature", "")
        if not RequestValidator(settings.twilio_auth_token).validate(url, params, signature):
            logger.warning(f"Rejected Twilio status callback with bad signature ({url})")
            raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid Twilio signature")

    call_status = params.get("CallStatus", "")
    call_sid = params.get("CallSid")
    state = registry.get(request.query_params.get("call_token")) or registry.by_sid(call_sid)
    logger.info(f"Twilio status {call_status} for {call_sid}")
    if state is None:
        return JSONResponse({"ok": True, "ignored": "unknown call"})

    if call_status in _UNANSWERED:
        result, notes = _UNANSWERED[call_status]
        await agent.report_result(state, result, notes=notes)
        await agent.call_ended(state, call_status)
    elif call_status == "completed" and not state.stream_connected:
        # Answered, but our media stream never came up (e.g. bad PUBLIC_HOST).
        await agent.report_result(
            state, "failed", notes="Call connected but the voice agent never joined"
        )
        await agent.call_ended(state, "stream_never_connected")

    return JSONResponse({"ok": True})
