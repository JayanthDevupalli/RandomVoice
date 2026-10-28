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
        // Professional calm upward glide
        let animClass = "animate-reaction-pro-center";
        if (r.trajectory === 1 || r.sway === "left" || r.trajectory === 4) {
          animClass = "animate-reaction-pro-left";
        } else if (r.trajectory === 2 || r.sway === "right" || r.trajectory === 5) {
          animClass = "animate-reaction-pro-right";
        } else {
          animClass = "animate-reaction-pro-center";
        }

        const animDuration = r.duration ? `${r.duration}s` : "1.4s";
        const scale = r.scale || 1;

        return (
          <div
            key={r.id}
            style={{
              left: `${r.x}%`,
              animationDuration: animDuration,
            }}
            className={`absolute bottom-28 sm:bottom-32 flex flex-col items-center pointer-events-none ${animClass}`}
          >
            {/* Professional Reaction Emoji */}
            <div
              style={{ transform: `scale(${scale})` }}
              className="text-3xl sm:text-4xl select-none filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
            >
              {r.emoji}
            </div>

            {/* Clean Professional Sender Pill */}
            {r.senderName && (
              <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-slate-300 bg-[#0E0F17]/85 backdrop-blur-xl border border-white/10 shadow-lg max-w-[120px] truncate tracking-wide">
                {r.senderName}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

