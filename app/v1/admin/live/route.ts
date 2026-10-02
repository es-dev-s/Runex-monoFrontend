import { proxyEventStream } from "@/lib/proxy-event-stream";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyEventStream(request, "/v1/admin/live");
}
