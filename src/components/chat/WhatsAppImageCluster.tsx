"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Lock, Loader2, Image as ImageIcon } from "lucide-react";
import { ChatImageItem } from "@/lib/chat-utils";
import { decryptImage } from "@/lib/e2ee-service";

interface WhatsAppImageClusterProps {
  images: ChatImageItem[];
  conversationId: string;
  caption?: string;
  isMe: boolean;
  onOpenLightbox: (
    images: Array<{ url: string; caption?: string; title?: string }>,
    initialIndex: number
  ) => void;
  timestamp?: string;
  readStatusNode?: React.ReactNode;
}

export function WhatsAppImageCluster({
  images,
  conversationId,
  caption,
  isMe,
  onOpenLightbox,
  timestamp,
  readStatusNode,
}: WhatsAppImageClusterProps) {
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [decryptionErrors, setDecryptionErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    images.forEach(async (img, idx) => {
      const imgKey = img.id || `img-${idx}`;

      // 1. If already provided as a blob URL (e.g. optimistic preview)
      if (img.url && !img.ciphertext) {
        if (isMounted) {
          setDecryptedUrls((prev) => ({ ...prev, [imgKey]: img.url! }));
        }
        return;
      }

      // 2. If already decrypted in local state
      if (decryptedUrls[imgKey]) return;

      // 3. Decrypt client-side using E2EE AES-256-GCM
      if (img.ciphertext && img.iv) {
        try {
          const blobUrl = await decryptImage(
            img.ciphertext,
            img.iv,
            conversationId,
            img.mimeType || "image/jpeg"
          );
          if (isMounted) {
            setDecryptedUrls((prev) => ({ ...prev, [imgKey]: blobUrl }));
          }
        } catch (err) {
          console.error("Failed to decrypt image at index", idx, err);
          if (isMounted) {
            setDecryptionErrors((prev) => ({ ...prev, [imgKey]: true }));
          }
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [images, conversationId]);

  // Prepared list for Lightbox
  const lightboxList = useMemo(() => {
    return images.map((img, idx) => {
      const key = img.id || `img-${idx}`;
      return {
        url: decryptedUrls[key] || img.url || "",
        caption: idx === 0 ? caption : undefined,
        title: `Photo ${idx + 1} of ${images.length}`,
      };
    });
  }, [images, decryptedUrls, caption]);

  const handleSlotClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    onOpenLightbox(lightboxList, index);
  };

  const count = images.length;
  const isSingle = count === 1;

  // Render a single image slot with lazy decryption skeleton
  const renderImageTile = (img: ChatImageItem, index: number, extraClasses: string = "") => {
    const key = img.id || `img-${index}`;
    const url = decryptedUrls[key] || img.url;
    const hasError = decryptionErrors[key];

    if (hasError) {
      return (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-rose-950/30 text-rose-300 p-3 text-center text-xs ${extraClasses}`}>
          <Lock size={18} className="mb-1 text-rose-400" />
          <span>Decryption Error</span>
        </div>
      );
    }

    if (!url) {
      return (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-black/40 text-slate-400 p-4 animate-pulse ${extraClasses}`}>
          <Loader2 size={18} className="animate-spin text-indigo-400 mb-1" />
          <span className="text-[10px] text-slate-500 font-mono">Decrypting E2EE...</span>
        </div>
      );
    }

    return (
      <img
        src={url}
        alt={caption || `Image ${index + 1}`}
        className={`w-full h-full object-cover transition-transform duration-200 hover:scale-[1.02] ${extraClasses}`}
        loading="lazy"
      />
    );
  };

  return (
    <div className="w-fit max-w-[280px] xs:max-w-[320px] sm:max-w-[360px] rounded-2xl overflow-hidden select-none">
      {/* WhatsApp Cluster Container */}
      <div className="relative rounded-2xl overflow-hidden bg-black/30 border border-white/10 group/cluster">
        {/* E2EE Security Badge on Top */}
        <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-emerald-400 text-[9px] font-semibold tracking-wide border border-emerald-500/20 shadow-sm">
            <Lock size={9} className="stroke-[2.5]" />
            <span>E2EE</span>
          </span>
        </div>

        {/* 1 Image Layout */}
        {isSingle && (
          <div
            onClick={(e) => handleSlotClick(e, 0)}
            className="relative cursor-pointer max-h-[360px] sm:max-h-[420px] overflow-hidden flex items-center justify-center"
          >
            {renderImageTile(images[0], 0, "max-h-[360px] sm:max-h-[420px] w-auto max-w-full object-contain")}

            {/* In-image timestamp overlay if no text caption */}
            {!caption && timestamp && (
              <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9.5px] font-medium text-white/90 border border-white/10 flex items-center gap-1 pointer-events-none">
                <span>{timestamp}</span>
                {readStatusNode}
              </div>
            )}
          </div>
        )}

        {/* 2 Images Layout: Side by Side (2 columns, 1 row) */}
        {count === 2 && (
          <div className="grid grid-cols-2 gap-0.5 h-36 sm:h-44 w-full">
            <div onClick={(e) => handleSlotClick(e, 0)} className="relative cursor-pointer overflow-hidden h-full">
              {renderImageTile(images[0], 0)}
            </div>
            <div onClick={(e) => handleSlotClick(e, 1)} className="relative cursor-pointer overflow-hidden h-full">
              {renderImageTile(images[1], 1)}
            </div>
          </div>
        )}

        {/* 3 Images Layout: 1 Large Top + 2 Bottom */}
        {count === 3 && (
          <div className="flex flex-col gap-0.5 w-full">
            <div
              onClick={(e) => handleSlotClick(e, 0)}
              className="relative cursor-pointer overflow-hidden h-36 sm:h-44 w-full"
            >
              {renderImageTile(images[0], 0)}
            </div>
            <div className="grid grid-cols-2 gap-0.5 h-24 sm:h-28 w-full">
              <div onClick={(e) => handleSlotClick(e, 1)} className="relative cursor-pointer overflow-hidden h-full">
                {renderImageTile(images[1], 1)}
              </div>
              <div onClick={(e) => handleSlotClick(e, 2)} className="relative cursor-pointer overflow-hidden h-full">
                {renderImageTile(images[2], 2)}
              </div>
            </div>
          </div>
        )}

        {/* 4 Images Layout: 2x2 Equal Grid */}
        {count === 4 && (
          <div className="grid grid-cols-2 gap-0.5 h-52 sm:h-60 w-full">
            {images.slice(0, 4).map((img, idx) => (
              <div
                key={img.id || idx}
                onClick={(e) => handleSlotClick(e, idx)}
                className="relative cursor-pointer overflow-hidden h-full"
              >
                {renderImageTile(img, idx)}
              </div>
            ))}
          </div>
        )}

        {/* > 4 Images Layout: Exactly WhatsApp Style (2x2 Grid with +N Overlay on the 4th slot) */}
        {count > 4 && (
          <div className="grid grid-cols-2 gap-0.5 h-52 sm:h-60 w-full">
            {/* Slot 0 */}
            <div onClick={(e) => handleSlotClick(e, 0)} className="relative cursor-pointer overflow-hidden h-full">
              {renderImageTile(images[0], 0)}
            </div>

            {/* Slot 1 */}
            <div onClick={(e) => handleSlotClick(e, 1)} className="relative cursor-pointer overflow-hidden h-full">
              {renderImageTile(images[1], 1)}
            </div>

            {/* Slot 2 */}
            <div onClick={(e) => handleSlotClick(e, 2)} className="relative cursor-pointer overflow-hidden h-full">
              {renderImageTile(images[2], 2)}
            </div>

            {/* Slot 3: 4th image with WhatsApp "+N" dark overlay */}
            <div
              onClick={(e) => handleSlotClick(e, 3)}
              className="relative cursor-pointer overflow-hidden h-full group/more"
            >
              {renderImageTile(images[3], 3)}
              {/* WhatsApp +N Dimming Overlay */}
              <div className="absolute inset-0 bg-black/65 group-hover/more:bg-black/55 backdrop-blur-[1.5px] transition-colors flex flex-col items-center justify-center text-white">
                <span className="font-extrabold text-2xl sm:text-3xl tracking-tight drop-shadow-md">
                  +{count - 3}
                </span>
                <span className="text-[10px] text-white/80 font-medium tracking-wide uppercase mt-0.5">
                  photos
                </span>
              </div>
            </div>
          </div>
        )}

        {/* In-cluster bottom overlay for multi-image without caption */}
        {!caption && count > 1 && timestamp && (
          <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9.5px] font-medium text-white/90 border border-white/10 flex items-center gap-1 pointer-events-none z-20">
            <span>{timestamp}</span>
            {readStatusNode}
          </div>
        )}
      </div>

      {/* Optional Caption Text Below Cluster */}
      {caption && (
        <div className={`p-2.5 flex flex-col gap-1 ${isMe ? "text-white" : "text-slate-100"}`}>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
            {caption}
          </p>
          {timestamp && (
            <div className={`text-[9.5px] flex items-center gap-1 self-end ${isMe ? "text-indigo-200/80" : "text-slate-400"}`}>
              <span>{timestamp}</span>
              {readStatusNode}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
