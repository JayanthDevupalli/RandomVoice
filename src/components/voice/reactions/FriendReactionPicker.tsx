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
        {/* Minimalist Floating Tooltip Label */}
        {hoveredItem && (
          <div className="absolute -top-8 sm:-top-9 pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide backdrop-blur-xl border border-white/10 bg-[#0E0F17]/95 text-slate-300 shadow-md flex items-center gap-1 whitespace-nowrap">
              <span>{hoveredItem.emoji}</span>
              <span>{hoveredItem.label}</span>
            </div>
          </div>
        )}

        {/* Minimalist Emoji Bar: 9x2 compact grid on mobile, sleek single-row pill on desktop */}
        <div className="relative grid grid-cols-9 gap-1 sm:flex sm:flex-row sm:items-center sm:gap-1 p-2 sm:px-3 sm:py-2.5 rounded-2xl sm:rounded-full bg-[#0E0F17]/90 backdrop-blur-2xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.65)] max-w-[96vw] overflow-x-auto sm:overflow-visible [&::-webkit-scrollbar]:hidden">
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
                className={`relative w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full text-base sm:text-lg flex items-center justify-center cursor-pointer select-none transition-all duration-150 ease-out hover:scale-125 hover:bg-white/10 active:scale-95 ${isTapped ? "scale-115 bg-white/20 ring-1 ring-white/30" : ""
                  } ${isHovered ? "z-10" : ""}`}
                title={item.label}
              >
                <span className="select-none leading-none filter drop-shadow-sm transition-transform">
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
