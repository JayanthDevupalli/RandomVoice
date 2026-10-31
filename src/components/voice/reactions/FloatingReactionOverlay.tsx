"use client";

import React, { memo } from "react";
import { VectorReaction } from "./friendsEmojis";

interface FloatingReactionOverlayProps {
  reactions: VectorReaction[];
}

export const FloatingReactionOverlay = memo(function FloatingReactionOverlay({
  reactions,
}: FloatingReactionOverlayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden select-none [contain:strict]"
    >
      {reactions.map((r) => {
        // Smooth, minimalist upward glide with calm micro-drift
        let animClass = "animate-reaction-smooth-center";
        if (r.sway === "left" || r.trajectory === 1) {
          animClass = "animate-reaction-smooth-left";
        } else if (r.sway === "right" || r.trajectory === 2) {
          animClass = "animate-reaction-smooth-right";
        }

        const animDuration = r.duration ? `${r.duration}s` : "2.2s";

        return (
          <div
            key={r.id}
            style={{
              left: `${r.x}%`,
              animationDuration: animDuration,
            }}
            className={`absolute bottom-24 sm:bottom-28 flex flex-col items-center pointer-events-none select-none ${animClass}`}
          >
            {/* Minimalist & Crisp Reaction Emoji */}
            <div className="text-3xl sm:text-4xl select-none filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              {r.emoji}
            </div>

            {/* Subtle Minimalist Sender Pill */}
            {r.senderName && (
              <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-slate-300 bg-black/60 backdrop-blur-md border border-white/10 shadow-sm max-w-[120px] truncate tracking-wide">
                {r.senderName}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
