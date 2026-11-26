"use client";

import { Navbar } from "@/components/layout/Navbar";

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-pulse">
        {/* Top bar skeleton */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10" />
            <div className="w-36 h-4 rounded-lg bg-white/10" />
          </div>
          <div className="w-28 h-7 rounded-full bg-white/10" />
        </div>

        {/* 12-col Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Hero Card Skeleton */}
          <div className="lg:col-span-4 bg-[#12131A]/95 border border-white/10 rounded-3xl overflow-hidden">
            <div className="h-32 w-full bg-white/5" />
            <div className="px-6 pb-6 -mt-14 flex flex-col items-center space-y-3">
              <div className="w-28 h-28 rounded-full bg-white/10 border-4 border-[#12131A]" />
              <div className="w-40 h-6 rounded-lg bg-white/10" />
              <div className="w-24 h-4 rounded-lg bg-white/5" />
              <div className="w-32 h-6 rounded-full bg-white/5" />
              <div className="w-full grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/40 border border-white/5">
                <div className="h-12 rounded-xl bg-white/5" />
                <div className="h-12 rounded-xl bg-white/5" />
              </div>
              <div className="w-full h-24 rounded-2xl bg-white/5" />
            </div>
          </div>

          {/* Right Dashboard Skeleton */}
          <div className="lg:col-span-8 space-y-6">
            <div className="h-14 rounded-2xl bg-[#12131A]/95 border border-white/10" />
            <div className="bg-[#12131A]/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-2xl bg-white/10" />
                <div className="space-y-1.5">
                  <div className="w-36 h-4 rounded bg-white/10" />
                  <div className="w-52 h-3 rounded bg-white/5" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="h-20 rounded-2xl bg-white/5" />
                <div className="h-20 rounded-2xl bg-white/5" />
              </div>
              <div className="h-32 rounded-2xl bg-white/5" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
