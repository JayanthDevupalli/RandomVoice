import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingWelcome } from "@/components/landing/LandingWelcome";

export const metadata: Metadata = {
  title: "Member Login & Account Recovery",
  description:
    "Log into your YapClub member account to access persistent direct messages, user profiles, and friend circles.",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0C10]" />}>
      <LandingWelcome initialMode="login" />
    </Suspense>
  );
}
