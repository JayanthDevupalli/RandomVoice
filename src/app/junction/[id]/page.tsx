"use client";

import { useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { Radio } from "lucide-react";
import { useParams } from "next/navigation";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";

export default function JunctionVoicePage({ params: propParams }: { params?: { id: string } }) {
  const { user, isLoaded } = useUser();
  const routeParams = useParams();
  const junctionId = (routeParams?.id as string) || propParams?.id || "";
  const { activeJunctionId, setActiveJunctionId, isMinimized, setIsMinimized } = useActiveJunction();

  useEffect(() => {
    if (junctionId && isLoaded && user) {
      if (activeJunctionId !== junctionId) {
        setActiveJunctionId(junctionId);
      }
      if (isMinimized) {
        setIsMinimized(false);
      }
    }
  }, [junctionId, isLoaded, user, activeJunctionId, isMinimized, setActiveJunctionId, setIsMinimized]);

  if (!isLoaded || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center animate-pulse mb-3">
          <Radio className="w-7 h-7 text-white animate-spin" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading Session...</p>
      </div>
    );
  }

  // The active junction room is rendered persistently by ActiveJunctionOverlay in layout.tsx!
  return <div className="min-h-screen bg-background" />;
}


