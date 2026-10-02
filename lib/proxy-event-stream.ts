import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

const controlPlane = (
  process.env.RUNEX_API_URL ||
  process.env.HARBOR_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8080"
).replace(/\/+$/, "");

/** Pipe a control-plane event stream without waiting for it to finish. */
export async function proxyEventStream(request: NextRequest, path: string) {
  const target = new URL(`${controlPlane}${path}`);
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
    request.signal.addEventListener("abort", () => req.destroy(), { once: true });
    req.on("error", reject);
    req.end();
  });

  const status = upstream.statusCode ?? 502;
  const contentType = upstream.headers["content-type"] ?? "application/json";
  if (status !== 200 || !String(contentType).includes("text/event-stream")) {
    const chunks: Buffer[] = [];
    for await (const chunk of upstream) chunks.push(Buffer.from(chunk));
    return new Response(Buffer.concat(chunks).toString("utf8"), {
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
