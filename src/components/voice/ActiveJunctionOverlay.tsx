"use client";

import React from "react";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";
import { useUser } from "@/hooks/useUser";
import { JunctionRoom } from "./JunctionRoom";

export function ActiveJunctionOverlay() {
  const { activeJunctionId, isMinimized, minimize, maximize, leaveJunction } = useActiveJunction();
  const { user, isLoaded } = useUser();

  if (!activeJunctionId || !isLoaded || !user) {
    return null;
  }

  // When not minimized, display full stage. When minimized, display floating mini-player.
  if (!isMinimized) {
    return (
      <div className="fixed inset-0 z-40 bg-background overflow-hidden flex flex-col">
        <JunctionRoom
          key={activeJunctionId}
          junctionId={activeJunctionId}
          guest={user as any}
          isMinimized={false}
          onMinimize={minimize}
          onMaximize={maximize}
          onLeave={leaveJunction}
        />
      </div>
    );
  }

  return (
    <JunctionRoom
      key={activeJunctionId}
      junctionId={activeJunctionId}
      guest={user as any}
      isMinimized={true}
      onMinimize={minimize}
      onMaximize={maximize}
      onLeave={leaveJunction}
    />
  );
}
