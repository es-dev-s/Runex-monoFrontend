import { AuthScreen } from "@/components/auth/auth-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Runex",
  description: "Sign in to your Runex account",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const raw = params.oauth_error;
  const oauthError = typeof raw === "string" && /^[a-z_]{1,40}$/.test(raw) ? raw : undefined;
  return <AuthScreen mode="sign-in" oauthError={oauthError} />;
}
