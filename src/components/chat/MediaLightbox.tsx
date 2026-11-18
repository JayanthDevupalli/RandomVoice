"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Smile } from "lucide-react";
import { createPortal } from "react-dom";
import { QuickReactionPicker, ReactionBadges } from "@/components/chat/MessageReactions";
import { MessageReaction } from "@/lib/chat-utils";

interface MediaLightboxProps {
  mediaUrl: string | null;
  onClose: () => void;
  title?: string;
  onToggleReaction?: (emoji: string) => void;
  reactions?: MessageReaction[];
  currentUserId?: string;
}

export function MediaLightbox({
  mediaUrl,
  onClose,
  title = "Media",
  onToggleReaction,
  reactions,
  currentUserId,
}: MediaLightboxProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (mediaUrl) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mediaUrl, onClose]);

  if (!mediaUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="w-full max-w-5xl flex items-center justify-between z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-white">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-xs opacity-80">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onToggleReaction && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowReactionPicker((prev) => !prev)}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  showReactionPicker
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/30"
                    : "bg-white/10 hover:bg-white/20 text-white"
                }`}
                title="React"
                aria-label="React"
              >
                <Smile size={16} />
              </button>

              {showReactionPicker && (
                <div className="absolute top-full right-0 mt-2 z-50">
                  <QuickReactionPicker
                    onSelect={(emoji) => {
                      onToggleReaction(emoji);
                      setShowReactionPicker(false);
                    }}
                    onClose={() => setShowReactionPicker(false)}
                    isMe={false}
                  />
                </div>
              )}
            </div>
          )}

          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Open in new tab"
            aria-label="Open in new tab"
          >
            <ExternalLink size={16} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Close viewer (Esc)"
            aria-label="Close viewer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Media Container */}
      <div
        className="relative max-w-4xl max-h-[80vh] flex flex-col items-center justify-center my-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={mediaUrl}
          alt={title}
          className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
        />

        {reactions && reactions.length > 0 && onToggleReaction && (
          <div className="mt-2 flex justify-center z-20">
            <ReactionBadges
              reactions={reactions}
              currentUserId={currentUserId}
              onToggleReaction={onToggleReaction}
              onOpenPicker={() => setShowReactionPicker(true)}
            />
          </div>
        )}
      </div>

      {/* Bottom Hint */}
      <div className="text-[11px] text-slate-500 font-mono tracking-wide z-10 shrink-0 mt-1">
        Click anywhere or press Esc to close
      </div>
    </div>,
    document.body
  );
}
