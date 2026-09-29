import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The fallback rewrite buffers the control-plane event stream, so deploy
 * logs and status only appeared after a refresh. This route pipes each
 * flushed frame straight through.
 */
const controlPlane = (
  process.env.RUNEX_API_URL ||
  process.env.HARBOR_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8080"
).replace(/\/+$/, "");

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const target = new URL(`${controlPlane}/v1/projects/${encodeURIComponent(id)}/events`);
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;

  const upstream = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = transport(
      target,
      {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          cookie: request.headers.get("cookie") ?? "",
        },
      },
      resolve,
    );
    const abort = () => req.destroy();
    request.signal.addEventListener("abort", abort, { once: true });
    req.on("error", reject);
    req.end();
  });

  const status = upstream.statusCode ?? 502;
  const contentType = upstream.headers["content-type"] ?? "application/json";
  if (status !== 200 || !String(contentType).includes("text/event-stream")) {
    const body = await streamToString(upstream);
    return new Response(body, {
      status,
      headers: { "content-type": String(contentType) },
    });
  }

  const stream = Readable.toWeb(upstream) as ReadableStream<Uint8Array>;
  request.signal.addEventListener("abort", () => upstream.destroy(), { once: true });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function streamToString(stream: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}
