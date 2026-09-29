import { InboxDashboard } from "@/components/inbox/inbox-dashboard";
import { parseBoot } from "@/lib/boot";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function WorkspacePage() {
  const jar = await cookies();
  if (!jar.get("platform_session")?.value) redirect("/sign-in?next=/app");
  return <InboxDashboard boot={parseBoot(jar.get("runex_boot")?.value, true)} />;
}
