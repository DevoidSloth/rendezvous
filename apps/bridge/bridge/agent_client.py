"""HTTP client for the agent server's ``/bridge/*`` endpoints.

Contract (every request carries ``X-Bridge-Secret``):

- ``POST /bridge/ask_group``      ``{call_token, question, options, binding}``
  long-polls up to ~65s and returns ``{answer, answered_by, timed_out}``.
- ``POST /bridge/report_result``  ``{call_token, status, time?, notes?}`` -> ``{ok: true}``
- ``POST /bridge/call_ended``     ``{call_token, reason}``

``report_result`` and ``call_ended`` are sent at most once per call; the guard
lives on :class:`~bridge.models.CallState` so every code path (voice tools,
Twilio status webhooks, the simulator) shares it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from loguru import logger

from .config import get_settings
from .models import RESULT_STATUSES, CallState


@dataclass(frozen=True)
class GroupAnswer:
    """The group's reply to an ``ask_group`` question."""

    answer: str | None
    answered_by: str | None
    timed_out: bool
    # Set when the agent server could not be reached at all.
    error: str | None = None


class AgentClient:
    """Thin async wrapper around the agent server's bridge endpoints."""

    def __init__(self, base_url: str | None = None, secret: str | None = None) -> None:
        settings = get_settings()
        self._base_url = (base_url or settings.agent_url).rstrip("/")
        self._secret = secret if secret is not None else settings.bridge_secret
        self._ask_timeout = settings.ask_group_http_timeout_secs

    def _headers(self) -> dict[str, str]:
        return {"X-Bridge-Secret": self._secret, "Content-Type": "application/json"}

    async def _post(self, path: str, body: dict[str, Any], timeout: float) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{self._base_url}{path}", json=body, headers=self._headers())
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def ask_group(
        self, call_token: str, question: str, options: list[str], binding: bool
    ) -> GroupAnswer:
        """Relay a host question to the group chat and wait for the first valid reply."""
        body = {
            "call_token": call_token,
            "question": question,
            "options": options,
            "binding": binding,
        }
        try:
            data = await self._post("/bridge/ask_group", body, timeout=self._ask_timeout)
        except (httpx.HTTPError, ValueError) as exc:
            logger.error(f"ask_group failed for {call_token}: {exc!r}")
            return GroupAnswer(answer=None, answered_by=None, timed_out=True, error=str(exc))

        answer = data.get("answer")
        return GroupAnswer(
            answer=str(answer) if answer not in (None, "") else None,
            answered_by=data.get("answered_by"),
            timed_out=bool(data.get("timed_out", answer in (None, ""))),
        )

    async def report_result(
        self,
        state: CallState,
        status: str,
        time: str | None = None,
        notes: str | None = None,
    ) -> bool:
        """Post the booking outcome once. Returns True if this call sent it."""
        if state.result_reported:
            logger.info(f"report_result already sent for {state.booking.call_token}; skipping")
            return False
        if status not in RESULT_STATUSES:
            logger.warning(f"Unknown result status {status!r}; reporting as 'failed'")
            notes = f"{notes or ''} (original status: {status})".strip()
            status = "failed"

        body: dict[str, Any] = {"call_token": state.booking.call_token, "status": status}
        if time:
            body["time"] = time
        if notes:
            body["notes"] = notes

        # Mark first so concurrent paths (e.g. a status webhook racing the
        # voice tool) cannot double-post.
        state.result_reported = True
        try:
            await self._post("/bridge/report_result", body, timeout=15)
            logger.info(f"Reported result for {state.booking.call_token}: {body}")
            return True
        except httpx.HTTPError as exc:
            logger.error(f"report_result failed for {state.booking.call_token}: {exc!r}")
            state.result_reported = False
            return False

    async def call_ended(self, state: CallState, reason: str) -> None:
        """Tell the agent server the call is over (once)."""
        if state.call_ended_sent:
            return
        state.call_ended_sent = True
        body = {"call_token": state.booking.call_token, "reason": reason}
        try:
            await self._post("/bridge/call_ended", body, timeout=15)
            logger.info(f"Sent call_ended for {state.booking.call_token}: {reason}")
        except httpx.HTTPError as exc:
            logger.error(f"call_ended failed for {state.booking.call_token}: {exc!r}")
