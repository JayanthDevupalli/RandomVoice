"use client";

import { useEffect } from "react";
import { X, ExternalLink, Download } from "lucide-react";
import { createPortal } from "react-dom";

interface MediaLightboxProps {
  mediaUrl: string | null;
  onClose: () => void;
  title?: string;
}

export function MediaLightbox({ mediaUrl, onClose, title = "Media" }: MediaLightboxProps) {
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
        className="w-full flex items-center justify-between z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-white">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-xs opacity-80">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={16} />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close viewer (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Media Container */}
      <div
        className="relative max-w-4xl max-h-[80vh] flex items-center justify-center my-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={mediaUrl}
          alt={title}
          className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
        />
      </div>

      {/* Bottom Hint */}
      <div className="text-[11px] text-slate-500 font-mono tracking-wide z-10">
        Click anywhere or press Esc to close
      </div>
    </div>,
    document.body
  );
}
