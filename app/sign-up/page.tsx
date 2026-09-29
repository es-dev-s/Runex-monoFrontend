import { AuthScreen } from "@/components/auth/auth-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account · Runex",
  description: "Create a Runex account",
};

export default function SignUpPage() {
  return <AuthScreen mode="sign-up" />;
}
