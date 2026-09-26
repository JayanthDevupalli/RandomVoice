"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGuestUser } from "@/hooks/useGuestUser";
import { useUser } from "@/hooks/useUser";
import { LandingWelcome } from "@/components/landing/LandingWelcome";

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDirectLogin = searchParams.get("login") === "true" || searchParams.get("mode") === "login";

  const { hasCompletedOnboarding, isLoaded: isGuestLoaded } = useGuestUser();
  const { isRegistered, isLoaded: isUserLoaded } = useUser();

  const isLoaded = isGuestLoaded && isUserLoaded;

  useEffect(() => {
    // If user has already completed onboarding or is registered, and didn't explicitly request the login page
    if (isLoaded && (hasCompletedOnboarding || isRegistered) && !isDirectLogin) {
      router.push("/junctions");
    }
  }, [isLoaded, hasCompletedOnboarding, isRegistered, isDirectLogin, router]);

  if (!isLoaded || ((hasCompletedOnboarding || isRegistered) && !isDirectLogin)) {
    // Blank slate during auto-redirect
    return <div className="min-h-screen bg-[#0B0C10]" />;
  }

  return (
    <LandingWelcome initialMode={isDirectLogin ? "login" : "guest"} />
  );
}

export default function RootLandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0C10]" />}>
      <LandingContent />
    </Suspense>
  );
}
