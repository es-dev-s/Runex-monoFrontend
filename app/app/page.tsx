import { InboxDashboard } from "@/components/inbox/inbox-dashboard";
import { parseBoot } from "@/lib/boot";
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function workspaceCookie(value: string | undefined) {
  if (!value) return null;
  let raw = value;
  if (!raw.startsWith("{")) {
    try {
      raw = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return raw.startsWith("{") ? raw : null;
}

export default async function WorkspacePage() {
  const jar = await cookies();
  if (!jar.get("platform_session")?.value) redirect("/sign-in?next=/app");
  return (
    <InboxDashboard
      boot={parseBoot(jar.get("runex_boot")?.value, true)}
      workspaceRaw={workspaceCookie(jar.get(WORKSPACE_COOKIE)?.value)}
    />
  );
}
