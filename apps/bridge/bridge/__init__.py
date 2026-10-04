"""Rendezvous call bridge.

A small FastAPI service that places venue reservation calls through Twilio and
bridges the call audio to the Grok Voice Agent API via Pipecat. The TypeScript
agent server owns all group state; this service only talks to it over the
``/bridge/*`` HTTP contract (see ``agent_client.py``).
"""

__version__ = "0.1.0"
