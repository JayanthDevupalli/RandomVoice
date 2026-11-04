"use client";

import React, { memo } from "react";
import { VectorReaction } from "./friendsEmojis";

interface FloatingReactionOverlayProps {
  reactions: VectorReaction[];
}

interface FloatingReactionItemProps {
  reaction: VectorReaction;
}

const FloatingReactionItem = memo(function FloatingReactionItem({
  reaction: r,
}: FloatingReactionItemProps) {
  // Determine horizontal sway animation class based on sway & trajectory
  let swayClass = "animate-reaction-sway-center";
  if (r.sway === "wide-left") {
    swayClass = "animate-reaction-sway-wide-left";
  } else if (r.sway === "wide-right") {
    swayClass = "animate-reaction-sway-wide-right";
  } else if (r.sway === "left" || r.trajectory === 1) {
    swayClass = "animate-reaction-sway-left";
  } else if (r.sway === "right" || r.trajectory === 2) {
    swayClass = "animate-reaction-sway-right";
  } else if (r.sway === "wave" || r.trajectory === 3) {
    swayClass = "animate-reaction-sway-wave";
  }

  const animDuration = r.duration ? `${r.duration}s` : "4.0s";

  return (
    // Layer 1: Continuous, uninterrupted vertical ascent (Y-axis only: zero stops, zero stutter)
    <div
      style={{
        left: `${r.x}%`,
        animationDuration: animDuration,
      }}
      className="absolute bottom-20 sm:bottom-24 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none animate-reaction-rise"
    >
      {/* Layer 2: Fluid horizontal air-current drift */}
      <div
        style={{ animationDuration: animDuration }}
        className={`flex flex-col items-center pointer-events-none select-none ${swayClass}`}
      >
        {/* Reaction Emoji */}
        <div className="text-2xl sm:text-3xl select-none filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
          {r.emoji}
        </div>

        {/* Sender Name Pill Directly Below Emoji - Consistently visible throughout flight */}
        {r.senderName && (
          <span
            className="mt-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold text-slate-100 bg-black/70 backdrop-blur-md border border-white/15 shadow-sm max-w-[85px] sm:max-w-[105px] truncate tracking-wide pointer-events-none text-center"
          >
            {r.senderName}
          </span>
        )}
      </div>
    </div>
  );
});

export const FloatingReactionOverlay = memo(function FloatingReactionOverlay({
  reactions,
}: FloatingReactionOverlayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden select-none [contain:strict]"
    >
      {reactions.map((r) => (
        <FloatingReactionItem key={r.id} reaction={r} />
      ))}
    </div>
  );
});
