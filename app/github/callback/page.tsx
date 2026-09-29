"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { github } from "@/lib/api";

export default function GitHubCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installation = Number(params.get("installation_id") || "0");
    void github
      .complete(Number.isFinite(installation) && installation > 0 ? installation : undefined)
      .catch(() => undefined)
      .finally(() => {
        router.replace("/app");
      });
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6 text-[#1d1d1f]">
      <p className="text-[14px] tracking-tight">Finishing the GitHub connection…</p>
    </main>
  );
}
