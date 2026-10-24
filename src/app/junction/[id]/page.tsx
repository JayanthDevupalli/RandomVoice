"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/hooks/useUser";
import { Shield, Radio } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";

export default function JunctionVoicePage({ params: propParams }: { params?: { id: string } }) {
  const { user, isLoaded } = useUser();
  const routeParams = useParams();
  const junctionId = (routeParams?.id as string) || propParams?.id || "";
  const { activeJunctionId, setActiveJunctionId, setIsMinimized } = useActiveJunction();
  const lastJoinedJunctionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (junctionId && isLoaded && user && !user.isBanned) {
      if (lastJoinedJunctionIdRef.current !== junctionId) {
        lastJoinedJunctionIdRef.current = junctionId;
        setActiveJunctionId(junctionId);
        setIsMinimized(false);
      }
    }
  }, [junctionId, isLoaded, user, setActiveJunctionId, setIsMinimized]);

  if (isLoaded && user?.isBanned) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-8 rounded-3xl bg-card max-w-md w-full text-center border border-rose-500/40 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
            <Shield size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Account Suspended</h2>
          <p className="text-xs text-rose-300 mb-6">
            {user.bannedReason || "Your account has been suspended by YapClub moderation."}
          </p>
          <Link
            href="/junctions"
            className="inline-block w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg"
          >
            Return to Junctions
          </Link>
        </div>
      </div>
    );
  }

  if (!isLoaded || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="h-16 w-auto flex items-center justify-center animate-pulse mb-3">
          <img src="/webIcon.png" alt="YapClub" className="h-14 w-auto object-contain filter drop-shadow-[0_4px_20px_rgba(99,102,241,0.45)]" />
        </div>
        <p className="text-xs text-slate-400 font-medium tracking-wide">Loading Session...</p>
      </div>
    );
  }

  // The active junction room is rendered persistently by ActiveJunctionOverlay in layout.tsx!
  return <div className="min-h-screen bg-background" />;
}


