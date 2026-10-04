"""Run the bridge: ``python -m bridge`` (honours BRIDGE_PORT, default 8765)."""

import uvicorn

from .config import get_settings


def main() -> None:
    uvicorn.run("bridge.server:app", host="0.0.0.0", port=get_settings().port, log_level="info")


if __name__ == "__main__":
    main()
