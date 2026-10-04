"""The Grok Voice pipeline and the three call tools.

One :class:`VoiceCallSession` runs per phone call. It wires

    transport.input() -> user aggregator -> GrokRealtimeLLMService
        -> SpeechTracker -> transport.output() -> assistant aggregator

and registers the tools the spec gives the voice agent:

- ``ask_group(question, options, binding)``: relays a host question to the
  group chat through the agent server and waits (up to ~60s) for the reply.
  While it waits, a scripted line is spoken every 15s so the host does not
  hang up on dead air.
- ``report_result(status, time, notes)``: posts the outcome to the agent server.
- ``end_call(reason)``: lets the goodbye finish playing, then hangs up.

The transport is injected so the same session runs over a Twilio media stream
(``server.py``) or the local mic/speaker (``dev_call.py``).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    EndFrame,
    Frame,
    FunctionCallResultProperties,
    LLMRunFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.xai.realtime import events as grok_events
from pipecat.services.xai.realtime.llm import GrokRealtimeLLMService
from pipecat.transports.base_transport import BaseTransport
from pipecat.workers.runner import WorkerRunner

from .agent_client import AgentClient
from .config import get_settings
from .models import RESULT_STATUSES, CallState
from .prompts import FILLER_LINE, build_kickoff_message, build_system_prompt

# Called once the goodbye has played; hangs up the underlying phone call.
HangupFn = Callable[[], Awaitable[None]]

# ---------------------------------------------------------------------------
# Tool schemas (names and arguments match SPEC.md section 4)
# ---------------------------------------------------------------------------

ASK_GROUP_SCHEMA = FunctionSchema(
    name="ask_group",
    description=(
        "Ask the friend group (in their group chat) a question the host just asked that you "
        "cannot answer from the booking details. Blocks for up to about 60 seconds until the "
        "first valid reply. Before calling, tell the host you're checking with your group. "
        "Set binding=true when the question involves money or a commitment (fees, deposits, "
        "minimum spend, prepayment, cancellation policy) so that only the organizer's reply "
        "counts; otherwise binding=false and the first reply from anyone counts. Returns "
        "{answered, answer, answered_by} or {answered: false, timed_out: true, guidance}."
    ),
    properties={
        "question": {
            "type": "string",
            "description": "Short question for the group, e.g. 'They only have 8:00 PM or 8:30 PM. Which works?'",
        },
        "options": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2-4 short answer choices, e.g. ['8:00 PM', '8:30 PM']; ['Yes', 'No'] for yes/no questions.",
        },
        "binding": {
            "type": "boolean",
            "description": "True if the answer commits the group to money or a policy (fees, deposits, cancellation terms).",
        },
    },
    required=["question", "options", "binding"],
)

REPORT_RESULT_SCHEMA = FunctionSchema(
    name="report_result",
    description=(
        "Report the booking outcome to the group chat. Call exactly once, as soon as the outcome "
        "is clear and before saying goodbye."
    ),
    properties={
        "status": {
            "type": "string",
            "enum": list(RESULT_STATUSES),
            "description": "booked, unavailable (no table), failed (anything else), or no-answer (voicemail/IVR).",
        },
        "time": {
            "type": "string",
            "description": "Confirmed reservation time, e.g. '7:15 PM'. Required when status is booked.",
        },
        "notes": {
            "type": "string",
            "description": "Anything the group should know: table type, hold time, alternatives offered, why it failed.",
        },
    },
    required=["status"],
)

END_CALL_SCHEMA = FunctionSchema(
    name="end_call",
    description=(
        "Hang up the phone call. Only call this after report_result and after you have finished "
        "saying goodbye out loud."
    ),
    properties={
        "reason": {"type": "string", "description": "Short reason, e.g. 'booking confirmed'."},
    },
    required=["reason"],
)

TOOLS = ToolsSchema(standard_tools=[ASK_GROUP_SCHEMA, REPORT_RESULT_SCHEMA, END_CALL_SCHEMA])

TIMEOUT_GUIDANCE = (
    "The group did not reply in time. If a safe, non-binding default exists (any table, the time "
    "closest to the requested one), accept it and continue. Never accept a fee, deposit or "
    "cancellation policy by default. Otherwise tell the host you will confirm with your group and "
    "call back, then report_result with status 'failed' and notes describing the open question, "
    "say goodbye, and end_call."
)


class SpeechTracker(FrameProcessor):
    """Tracks whether the bot is audibly speaking.

    Sits after the LLM so it sees the Bot{Started,Stopped}SpeakingFrames the
    output transport broadcasts. Used to avoid talking over ourselves with
    filler lines and to hang up only after the goodbye has finished playing.
    """

    def __init__(self) -> None:
        super().__init__(name="SpeechTracker")
        self.speaking = False
        self.last_stopped_at = time.monotonic()

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, BotStartedSpeakingFrame):
            self.speaking = True
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self.speaking = False
            self.last_stopped_at = time.monotonic()
        await self.push_frame(frame, direction)

    async def wait_until_quiet(self, quiet_secs: float = 1.2, timeout_secs: float = 12.0) -> None:
        """Wait until the bot has been silent for ``quiet_secs`` (or the timeout passes)."""
        deadline = time.monotonic() + timeout_secs
        while time.monotonic() < deadline:
            if not self.speaking and time.monotonic() - self.last_stopped_at >= quiet_secs:
                return
            await asyncio.sleep(0.1)
        logger.warning("Timed out waiting for the bot to finish speaking; hanging up anyway")


class VoiceCallSession:
    """Runs one reservation call through Grok Voice."""

    def __init__(
        self,
        state: CallState,
        transport: BaseTransport,
        *,
        hang_up: HangupFn | None = None,
        agent: AgentClient | None = None,
        sample_rate: int = 8000,
        handle_sigint: bool = False,
        wait_for_client: bool = True,
    ) -> None:
        settings = get_settings()
        if not settings.xai_api_key:
            raise RuntimeError("XAI_API_KEY is not set")

        self.state = state
        self.transport = transport
        self._hang_up_fn = hang_up
        self.agent = agent or AgentClient()
        self._filler_interval = settings.filler_interval_secs
        self._max_call_secs = settings.max_call_secs
        self._end_reason: str | None = None
        self._ending = False
        self._background: set[asyncio.Task[Any]] = set()

        booking = state.booking
        self.llm = GrokRealtimeLLMService(
            api_key=settings.xai_api_key,
            settings=GrokRealtimeLLMService.Settings(
                model=settings.grok_model,
                system_instruction=build_system_prompt(booking),
                session_properties=grok_events.SessionProperties(
                    voice=settings.grok_voice,
                    # Server-side VAD drives turn-taking. A slightly longer
                    # silence window avoids cutting hosts off mid-sentence.
                    turn_detection=grok_events.TurnDetection(
                        type="server_vad", silence_duration_ms=600
                    ),
                ),
            ),
        )
        # ask_group and report_result must survive the host talking over us
        # (an interruption would otherwise cancel the in-flight call).
        self.llm.register_function("ask_group", self._ask_group, cancel_on_interruption=False)
        self.llm.register_function(
            "report_result", self._report_result, cancel_on_interruption=False
        )
        self.llm.register_function("end_call", self._end_call, cancel_on_interruption=False)

        self.context = LLMContext(
            messages=[{"role": "developer", "content": build_kickoff_message(booking)}],
            tools=TOOLS,
        )
        # No local VAD: Grok's server VAD proposes turns and the pair
        # auto-configures realtime mode from the service's metadata.
        user_aggregator, assistant_aggregator = LLMContextAggregatorPair(self.context)
        self.speech = SpeechTracker()

        pipeline = Pipeline(
            [
                transport.input(),
                user_aggregator,
                self.llm,
                self.speech,
                transport.output(),
                assistant_aggregator,
            ]
        )
        self.worker = PipelineWorker(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=sample_rate,
                audio_out_sample_rate=sample_rate,
            ),
            enable_rtvi=False,
            # ask_group can legitimately sit quiet for a minute; filler lines
            # keep the idle detector happy, but leave generous headroom.
            idle_timeout_secs=180,
        )
        self.runner = WorkerRunner(handle_sigint=handle_sigint)

        @self.worker.event_handler("on_pipeline_error")
        async def _on_error(_worker, frame):
            await self._handle_pipeline_error(str(getattr(frame, "error", frame)))

        if wait_for_client:
            # Telephony: speak first as soon as Twilio's media stream is live.
            @transport.event_handler("on_client_connected")
            async def _on_connected(_transport, _client):
                logger.info(f"[{booking.call_token}] media connected; starting conversation")
                await self.worker.queue_frames([LLMRunFrame()])

            @transport.event_handler("on_client_disconnected")
            async def _on_disconnected(_transport, _client):
                logger.info(f"[{booking.call_token}] media disconnected")
                if self._end_reason is None:
                    self._end_reason = "remote_hangup"
                await self.runner.cancel()
        else:
            # Local audio has no "client"; start talking once the pipeline is up.
            @self.worker.event_handler("on_pipeline_started")
            async def _on_started(_worker, _frame):
                await self.worker.queue_frames([LLMRunFrame()])

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Run the call to completion, then notify the agent server."""
        await self.runner.add_workers(self.worker)
        try:
            await asyncio.wait_for(self.runner.run(), timeout=self._max_call_secs)
        except TimeoutError:
            logger.warning(f"[{self.state.booking.call_token}] max call duration reached")
            self._end_reason = self._end_reason or "max_duration"
            await self.runner.cancel()
            await self._hang_up()
        except Exception:
            logger.exception(f"[{self.state.booking.call_token}] pipeline error")
            self._end_reason = self._end_reason or "error"
            await self._hang_up()
        finally:
            for task in list(self._background):
                task.cancel()
            await self.agent.call_ended(self.state, self._end_reason or "completed")

    async def _handle_pipeline_error(self, message: str) -> None:
        """Fail the call cleanly if the Grok session can't be used.

        Pipecat's Grok service stops reading the socket after a connection
        failure or a server-side error, so the call would otherwise sit in
        dead air. Report it and hang up instead.
        """
        if "Grok" not in message or self._ending:
            logger.warning(f"[{self.state.booking.call_token}] non-fatal pipeline error: {message}")
            return
        logger.error(f"[{self.state.booking.call_token}] voice agent failed: {message}")
        self._ending = True
        self._end_reason = "voice_agent_error"
        await self.agent.report_result(
            self.state, "failed", notes="The voice agent hit an error during the call."
        )
        await self._hang_up()
        await self.runner.cancel()

    def _spawn(self, coro: Awaitable[Any]) -> asyncio.Task[Any]:
        task = asyncio.ensure_future(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)
        return task

    async def _hang_up(self) -> None:
        if self._hang_up_fn is not None:
            await self._hang_up_fn()

    async def _say_verbatim(self, text: str) -> None:
        """Speak a fixed line through Grok's ``force_message`` (no model involved)."""
        await self.llm.send_client_event(
            grok_events.ConversationItemCreateEvent(
                item=grok_events.ConversationItem(
                    type="force_message",
                    role="assistant",
                    content=[grok_events.ItemContent(type="output_text", text=text)],
                )
            )
        )

    async def _filler_loop(self) -> None:
        """Every N seconds while ask_group waits, reassure the host."""
        while True:
            await asyncio.sleep(self._filler_interval)
            if self._ending:
                return
            if self.speech.speaking:
                # Don't talk over the model; try again shortly.
                await asyncio.sleep(2)
                if self.speech.speaking:
                    continue
            logger.debug(f"[{self.state.booking.call_token}] filler: {FILLER_LINE}")
            try:
                await self._say_verbatim(FILLER_LINE)
            except Exception as exc:
                logger.warning(f"Filler line failed: {exc!r}")

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    async def _ask_group(self, params: FunctionCallParams) -> None:
        args = params.arguments
        question = str(args.get("question") or "").strip()
        options = [str(o) for o in (args.get("options") or []) if str(o).strip()]
        binding = bool(args.get("binding", False))
        token = self.state.booking.call_token

        if not question:
            await params.result_callback({"error": "question is required"})
            return

        self.state.questions.append(question)
        logger.info(f"[{token}] ask_group binding={binding}: {question} {options}")

        filler = self._spawn(self._filler_loop())
        try:
            reply = await self.agent.ask_group(token, question, options, binding)
        finally:
            filler.cancel()

        if reply.answer is not None:
            result: dict[str, Any] = {
                "answered": True,
                "answer": reply.answer,
                "answered_by": reply.answered_by,
            }
        else:
            result = {"answered": False, "timed_out": True, "guidance": TIMEOUT_GUIDANCE}
        logger.info(f"[{token}] ask_group result: {result}")
        await params.result_callback(result)

    async def _report_result(self, params: FunctionCallParams) -> None:
        args = params.arguments
        status = str(args.get("status") or "failed")
        sent = await self.agent.report_result(
            self.state,
            status,
            time=args.get("time") or None,
            notes=args.get("notes") or None,
        )
        await params.result_callback(
            {"ok": True, "already_reported": not sent and self.state.result_reported}
        )

    async def _end_call(self, params: FunctionCallParams) -> None:
        reason = str(params.arguments.get("reason") or "completed")
        logger.info(f"[{self.state.booking.call_token}] end_call: {reason}")
        self._end_reason = reason
        self._ending = True
        # Don't prompt another model turn; we're leaving.
        await params.result_callback(
            {"ok": True}, properties=FunctionCallResultProperties(run_llm=False)
        )
        self._spawn(self._finish_call())

    async def _finish_call(self) -> None:
        """Let the goodbye play out, then hang up and stop the pipeline."""
        # Give Grok a moment to start any goodbye audio emitted alongside the
        # tool call, then wait for it to finish.
        await asyncio.sleep(0.8)
        await self.speech.wait_until_quiet()
        # Twilio buffers a little audio on its side; let it drain.
        await asyncio.sleep(0.7)
        await self._hang_up()
        await self.worker.queue_frame(EndFrame())
