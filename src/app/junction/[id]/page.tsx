"use client";

import { useGuestUser } from "@/hooks/useGuestUser";
import { Navbar } from "@/components/layout/Navbar";
import { JunctionRoom } from "@/components/voice/JunctionRoom";
import { Radio } from "lucide-react";

export default function JunctionVoicePage({ params }: { params: { id: string } }) {
  const { guest, updateGuest, isLoaded } = useGuestUser();

  if (!isLoaded || !guest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center animate-pulse mb-3">
          <Radio className="w-7 h-7 text-white animate-spin" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading Guest Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-indigo-500 selection:text-white">
      <main className="flex-1 flex flex-col">
        <JunctionRoom junctionId={params.id} guest={guest} />
      </main>
    </div>
  );
}
