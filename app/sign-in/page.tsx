import { AuthScreen } from "@/components/auth/auth-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Runex",
  description: "Sign in to your Runex account",
};

export default function SignInPage() {
  return <AuthScreen mode="sign-in" />;
}
