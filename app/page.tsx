import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const jar = await cookies();
  if (jar.get("platform_session")?.value) redirect("/app");
  redirect("/sign-in");
}
