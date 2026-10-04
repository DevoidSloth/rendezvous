"""Twilio REST helpers: place the outbound call and hang it up.

The Twilio SDK is synchronous, so each call runs in a worker thread to keep the
event loop (and the live audio pipeline) responsive.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from urllib.parse import urlencode

from loguru import logger
from twilio.rest import Client
from twilio.twiml.voice_response import Connect, Stream, VoiceResponse

from .config import get_settings
from .models import CallRequest


class TwilioNotConfigured(RuntimeError):
    """Raised when a real call is requested without Twilio credentials."""


@lru_cache(maxsize=1)
def _client() -> Client:
    settings = get_settings()
    if not settings.twilio_configured:
        raise TwilioNotConfigured(
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER and PUBLIC_HOST"
        )
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


def build_stream_twiml(call_token: str) -> str:
    """TwiML that connects the answered call to our media-stream WebSocket.

    ``<Connect><Stream>`` gives a bidirectional stream; the call token rides
    along as a custom parameter and shows up in the stream's ``start`` message.
    When the stream closes there are no further verbs, so Twilio hangs up.
    """
    settings = get_settings()
    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=settings.public_ws_url)
    stream.parameter(name="call_token", value=call_token)
    connect.append(stream)
    response.append(connect)
    return str(response)


def status_callback_url(call_token: str) -> str:
    return f"{get_settings().public_status_url}?{urlencode({'call_token': call_token})}"


async def place_call(booking: CallRequest) -> str:
    """Dial the venue and return the Twilio call SID."""
    settings = get_settings()
    client = _client()

    def _create() -> str:
        call = client.calls.create(
            to=booking.to,
            from_=settings.twilio_from_number,
            twiml=build_stream_twiml(booking.call_token),
            status_callback=status_callback_url(booking.call_token),
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            status_callback_method="POST",
            # Give the venue ~30s to pick up before Twilio reports no-answer.
            timeout=30,
        )
        return call.sid

    call_sid = await asyncio.to_thread(_create)
    logger.info(f"Placed call {call_sid} to {booking.venue_name} ({booking.to})")
    return call_sid


async def hang_up(call_sid: str) -> None:
    """End a live call. Safe to call on a call that has already ended."""
    try:
        client = _client()
    except TwilioNotConfigured:
        return

    def _complete() -> None:
        client.calls(call_sid).update(status="completed")

    try:
        await asyncio.to_thread(_complete)
        logger.info(f"Hung up call {call_sid}")
    except Exception as exc:  # The call may already be over; that's fine.
        logger.debug(f"Hang-up for {call_sid} ignored: {exc!r}")
