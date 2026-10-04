import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { RendezvousEngine } from "@rendezvous/core";
import { config } from "./config.ts";

/**
 * HTTP endpoints the Python call bridge uses while it's on the phone:
 * ask_group long-polls until the group answers (or 60 seconds pass),
 * report_result posts the booking outcome to the chat.
 */

/** call token → the engine whose plan is being booked */
export const activeCalls = new Map<string, RendezvousEngine>();

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startServer(extra?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, calls: activeCalls.size });
      if (extra && (await extra(req, res))) return;
      if (!req.url?.startsWith("/bridge/") || req.method !== "POST") return send(res, 404, { error: "not found" });
      if (req.headers["x-bridge-secret"] !== config.bridgeSecret) return send(res, 401, { error: "bad secret" });

      const body = await readJson(req);
      const engine = activeCalls.get(String(body.call_token ?? ""));
      if (!engine) return send(res, 404, { error: "unknown call_token" });

      switch (req.url) {
        case "/bridge/ask_group": {
          const options = Array.isArray(body.options) ? body.options.map(String) : [];
          const r = await engine.askGroup(String(body.question ?? ""), options, Boolean(body.binding));
          return send(res, 200, { answer: r.answer, answered_by: r.answeredBy ?? null, timed_out: r.timedOut });
        }
        case "/bridge/report_result": {
          const status = String(body.status) as "booked" | "unavailable" | "failed" | "no-answer";
          await engine.onCallResult({ status, time: body.time ? String(body.time) : undefined, notes: body.notes ? String(body.notes) : undefined });
          return send(res, 200, { ok: true });
        }
        case "/bridge/call_ended": {
          // A call that ends without a result counts as failed so the group isn't left waiting.
          if (engine.phase === "booking") await engine.onCallResult({ status: "failed", notes: String(body.reason ?? "") || undefined });
          activeCalls.delete(String(body.call_token));
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "not found" });
    } catch (err) {
      console.error("server error", err);
      if (!res.headersSent) send(res, 500, { error: String(err) });
    }
  });
  // ask_group can hold a request open for over a minute.
  server.requestTimeout = 120_000;
  server.listen(config.port, () => console.log(`agent server on :${config.port}`));
  return server;
}
