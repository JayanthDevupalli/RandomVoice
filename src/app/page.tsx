"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGuestUser } from "@/hooks/useGuestUser";
import { LandingWelcome } from "@/components/landing/LandingWelcome";

export default function RootLandingPage() {
  const router = useRouter();
  const { hasCompletedOnboarding, isLoaded } = useGuestUser();

  useEffect(() => {
    if (isLoaded && hasCompletedOnboarding) {
      router.push("/junctions");
    }
  }, [isLoaded, hasCompletedOnboarding, router]);

  if (!isLoaded || hasCompletedOnboarding) {
    // Show a sleek blank slate while auto-redirecting returning users
    return <div className="min-h-screen bg-[#0B0C10]" />;
  }

  return (
    <LandingWelcome />
  );
}
