import { AdminHome } from "@/components/admin/admin-home";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const sessionRole = cache(async (): Promise<"anon" | "admin" | "user"> => {
  const jar = await cookies();
  const session = jar.get("platform_session")?.value;
  if (!session) return "anon";

  const base = (process.env.RUNEX_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/v1/auth/me`, {
      headers: { cookie: `platform_session=${session}` },
      cache: "no-store",
    });
    if (res.status === 401) return "anon";
    if (!res.ok) return "user";
    const body = (await res.json()) as { user?: { role?: string } };
    return body.user?.role === "admin" ? "admin" : "user";
  } catch {
    return "user";
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const role = await sessionRole();
  if (role !== "admin") return { title: "Projects · Runex" };
  return { title: "Admin · Runex" };
}

export default async function AdminPage() {
  const role = await sessionRole();
  if (role === "anon") redirect("/sign-in?next=/admin");
  if (role !== "admin") redirect("/app");
  return <AdminHome granted />;
}
