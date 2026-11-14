"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, ExternalLink, Download, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { createPortal } from "react-dom";

export interface LightboxMediaItem {
  url: string;
  title?: string;
  caption?: string;
  isE2EE?: boolean;
}

interface MediaLightboxProps {
  mediaUrl?: string | null;
  images?: LightboxMediaItem[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
}

export function MediaLightbox({
  mediaUrl,
  images,
  initialIndex = 0,
  onClose,
  title = "Media",
}: MediaLightboxProps) {
  // Normalize items
  const items: LightboxMediaItem[] = images && images.length > 0
    ? images
    : mediaUrl
    ? [{ url: mediaUrl, title }]
    : [];

  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1))
  );

  useEffect(() => {
    setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
  }, [initialIndex, items.length]);

  const hasMultiple = items.length > 1;
  const currentItem = items[currentIndex];

  const handlePrev = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [hasMultiple, items.length]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [hasMultiple, items.length]);

  // Touch swipe support on mobile
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    if (items.length > 0) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items.length, onClose, handlePrev, handleNext]);

  const handleDownload = () => {
    if (!currentItem?.url) return;
    const a = document.createElement("a");
    a.href = currentItem.url;
    a.download = `yapclub-image-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!currentItem) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-between p-3 sm:p-6 select-none animate-in fade-in duration-200"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Bar */}
      <div
        className="w-full max-w-5xl flex items-center justify-between z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-white">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-xs text-white/90">
            {currentItem.title || title}
          </span>
          {hasMultiple && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
              {currentIndex + 1} / {items.length}
            </span>
          )}
          {currentItem.isE2EE !== false && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              <Lock size={10} />
              <span>End-to-End Encrypted</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Download image"
            aria-label="Download image"
          >
            <Download size={16} />
          </button>
          <a
            href={currentItem.url}
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

      {/* Main Image Viewport with Nav Arrows */}
      <div
        className="relative w-full max-w-5xl flex-1 min-h-0 flex items-center justify-center my-auto px-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Arrow */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-1 sm:left-4 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/10 shadow-2xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            title="Previous image (Left arrow)"
            aria-label="Previous image"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <div className="relative max-w-full max-h-[75vh] sm:max-h-[80vh] flex flex-col items-center justify-center">
          <img
            key={currentItem.url}
            src={currentItem.url}
            alt={currentItem.caption || currentItem.title || "Image"}
            className="max-h-[70vh] sm:max-h-[76vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 transition-all duration-150 animate-in fade-in zoom-in-95"
          />

          {/* Optional Caption */}
          {currentItem.caption && (
            <div className="mt-2.5 px-4 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-white text-xs sm:text-sm text-center max-w-lg shadow-xl">
              {currentItem.caption}
            </div>
          )}
        </div>

        {/* Right Arrow */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-1 sm:right-4 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/10 shadow-2xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            title="Next image (Right arrow)"
            aria-label="Next image"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnails Strip (WhatsApp style) */}
      {hasMultiple && (
        <div
          className="w-full max-w-md flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 overflow-x-auto no-scrollbar z-20 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, idx) => (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                idx === currentIndex
                  ? "border-indigo-500 scale-105 shadow-md shadow-indigo-500/40 ring-1 ring-white/30"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={item.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Bottom Hint */}
      <div className="text-[11px] text-slate-500 font-mono tracking-wide z-10 shrink-0 mt-1">
        {hasMultiple ? "Use arrow keys or swipe to browse · Esc to close" : "Click anywhere or press Esc to close"}
      </div>
    </div>,
    document.body
  );
}
