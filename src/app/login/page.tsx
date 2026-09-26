"use client";

import { Suspense } from "react";
import { LandingWelcome } from "@/components/landing/LandingWelcome";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0C10]" />}>
      <LandingWelcome initialMode="login" />
    </Suspense>
  );
}
