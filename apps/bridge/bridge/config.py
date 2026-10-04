"""Environment-driven configuration for the call bridge.

All settings come from environment variables (optionally loaded from
``apps/bridge/.env``). Twilio and xAI credentials are only required for real
calls; the simulate flow and the health endpoint work without them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Load apps/bridge/.env regardless of the working directory the service is
# started from. Real environment variables take precedence over the file.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE, override=False)

# python.org builds of Python on macOS ship without a CA bundle, which makes
# the wss:// connection to xAI fail certificate verification. Fall back to
# certifi's bundle unless the environment already points somewhere.
if not os.getenv("SSL_CERT_FILE"):
    try:
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()
    except ImportError:  # pragma: no cover - certifi ships with httpx
        pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Resolved bridge configuration."""

    # Shared secret for every request between the bridge and the agent server.
    bridge_secret: str
    # Base URL of the TypeScript agent server.
    agent_url: str
    # Port the bridge listens on.
    port: int

    # xAI / Grok Voice.
    xai_api_key: str
    grok_voice: str
    grok_model: str

    # Twilio.
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_from_number: str
    # Public hostname (no scheme) that Twilio uses to reach this service, e.g.
    # the ngrok host "abc123.ngrok-free.app".
    public_host: str
    # Reject Twilio webhooks whose X-Twilio-Signature does not validate.
    validate_twilio_signature: bool

    # ask_group timing. The agent server long-polls for up to ~60s; the bridge
    # waits a little longer so the server's own timeout always wins.
    ask_group_http_timeout_secs: float
    # How often the voice agent fills silence while waiting on the group.
    filler_interval_secs: float
    # Hard cap on a single call, as a safety net against stuck sessions.
    max_call_secs: int

    @property
    def twilio_configured(self) -> bool:
        return bool(
            self.twilio_account_sid
            and self.twilio_auth_token
            and self.twilio_from_number
            and self.public_host
        )

    @property
    def public_ws_url(self) -> str:
        return f"wss://{self.public_host}/ws"

    @property
    def public_status_url(self) -> str:
        return f"https://{self.public_host}/twilio/status"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings (read once from the environment)."""
    public_host = _env("PUBLIC_HOST")
    # Be forgiving if someone pastes the full ngrok URL.
    for prefix in ("https://", "http://", "wss://", "ws://"):
        if public_host.startswith(prefix):
            public_host = public_host[len(prefix) :]
    public_host = public_host.rstrip("/")

    return Settings(
        bridge_secret=_env("BRIDGE_SECRET"),
        agent_url=_env("AGENT_URL", "http://localhost:8787").rstrip("/"),
        port=int(_env("BRIDGE_PORT", "8765") or 8765),
        xai_api_key=_env("XAI_API_KEY"),
        grok_voice=_env("GROK_VOICE", "rex") or "rex",
        grok_model=_env("GROK_MODEL", "grok-voice-latest") or "grok-voice-latest",
        twilio_account_sid=_env("TWILIO_ACCOUNT_SID"),
        twilio_auth_token=_env("TWILIO_AUTH_TOKEN"),
        twilio_from_number=_env("TWILIO_FROM_NUMBER"),
        public_host=public_host,
        validate_twilio_signature=_env_bool("VALIDATE_TWILIO_SIGNATURE", True),
        ask_group_http_timeout_secs=float(_env("ASK_GROUP_HTTP_TIMEOUT_SECS", "75") or 75),
        filler_interval_secs=float(_env("FILLER_INTERVAL_SECS", "15") or 15),
        max_call_secs=int(_env("MAX_CALL_SECS", "600") or 600),
    )
