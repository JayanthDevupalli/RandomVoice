"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";
import { useUser } from "@/hooks/useUser";

const JunctionRoom = dynamic(
  () => import("./JunctionRoom").then((mod) => mod.JunctionRoom),
  { ssr: false }
);

export function ActiveJunctionOverlay() {
  const { activeJunctionId, isMinimized, minimize, maximize, leaveJunction } = useActiveJunction();
  const { user, isLoaded } = useUser();

  React.useEffect(() => {
    if (user?.isBanned && activeJunctionId) {
      leaveJunction();
    }
  }, [user?.isBanned, activeJunctionId, leaveJunction]);

  if (!activeJunctionId || !isLoaded || !user || user.isBanned) {
    return null;
  }

  return (
    <div className={isMinimized ? "contents" : "fixed inset-0 z-[100] bg-background overflow-hidden flex flex-col"}>
      <JunctionRoom
        key={activeJunctionId}
        junctionId={activeJunctionId}
        guest={user as any}
        isMinimized={isMinimized}
        onMinimize={minimize}
        onMaximize={maximize}
        onLeave={leaveJunction}
      />
    </div>
  );
}
