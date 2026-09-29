import type { NextConfig } from "next";
import os from "os";

/**
 * The browser stays on this Next origin. `/v1/*` is rewritten to the Go API
 * so the HttpOnly session cookie stays first-party. The event stream is the
 * exception: `app/v1/projects/[id]/events` pipes it, because this rewrite
 * buffers the body until the connection ends.
 *
 * Set RUNEX_API_URL (or HARBOR_API_URL) to the control plane. Leave
 * NEXT_PUBLIC_API_URL empty unless the browser must call the API directly.
 */
const controlPlane = (
  process.env.RUNEX_API_URL ||
  process.env.HARBOR_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8080"
).replace(/\/+$/, "");

function lanDevOrigins(): string[] {
  const hosts = new Set(["127.0.0.1", "localhost", "app.runex.cloud"]);
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      const family = String(iface.family);
      if (iface.internal || (family !== "IPv4" && family !== "4")) continue;
      hosts.add(iface.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins(),
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  async rewrites() {
    return {
      fallback: [
        { source: "/v1/:path*", destination: `${controlPlane}/v1/:path*` },
        { source: "/healthz", destination: `${controlPlane}/healthz` },
      ],
    };
  },
};

export default nextConfig;
