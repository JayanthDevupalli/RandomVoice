"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  EmojiReactionItem,
  FRIENDS_EMOJI_REACTIONS,
} from "./friendsEmojis";

interface FriendReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectReaction: (item: EmojiReactionItem) => void;
}

export function FriendReactionPicker({
  isOpen,
  onClose,
  onSelectReaction,
}: FriendReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredItem, setHoveredItem] = useState<EmojiReactionItem | null>(null);
  const [activeTapId, setActiveTapId] = useState<string | null>(null);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close when clicking outside with passive touch support
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-reaction-trigger]")) return;
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleClick = (item: EmojiReactionItem) => {
    setActiveTapId(item.id);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setActiveTapId(null), 150);
    onSelectReaction(item);
  };

  return (
    <div
      ref={containerRef}
      className="z-50 select-none animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="relative flex flex-col items-center">
        {/* Floating Tooltip Label (fluid pill directly above on hover) */}
        {hoveredItem && (
          <div className="absolute -top-9 pointer-events-none z-20 animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150">
            <div className="px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide backdrop-blur-2xl border border-white/15 bg-[#0E0F17]/95 text-slate-200 shadow-xl flex items-center gap-1.5 whitespace-nowrap">
              <span>{hoveredItem.emoji}</span>
              <span>{hoveredItem.label}</span>
            </div>
          </div>
        )}

        {/* Fluid Rounded Pill Capsule Bar */}
        <div className="relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[#0E0F17]/92 backdrop-blur-3xl border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.18)] max-w-[94vw] sm:max-w-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {/* Subtle Ambient Backlight Glow Matching Hovered Color */}
          <div
            className="absolute -inset-1 rounded-full blur-xl opacity-20 transition-all duration-300 pointer-events-none"
            style={{ backgroundColor: hoveredItem?.color || "transparent" }}
          />

          {FRIENDS_EMOJI_REACTIONS.map((item) => {
            const isHovered = hoveredItem?.id === item.id;
            const isTapped = activeTapId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item)}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full text-lg sm:text-xl flex items-center justify-center cursor-pointer select-none transition-all duration-150 ease-out hover:scale-115 hover:bg-white/10 active:scale-95 ${
                  isTapped ? "scale-110 bg-white/15" : ""
                } ${isHovered ? "z-10" : ""}`}
                title={item.label}
              >
                <span className="transform transition-transform filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]">
                  {item.emoji}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

