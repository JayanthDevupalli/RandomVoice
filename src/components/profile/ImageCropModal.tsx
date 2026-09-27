"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  RotateCw,
  FlipHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Square,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";

export type AspectRatioOption = "free" | "1:1" | "4:3" | "16:9" | "3:4";

interface CropBox {
  x: number; // in pixels relative to display container
  y: number;
  width: number;
  height: number;
}

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApplyCrop: (croppedBlob: Blob) => Promise<void> | void;
  isSaving?: boolean;
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onClose,
  onApplyCrop,
  isSaving = false,
}: ImageCropModalProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Transformations
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>("free");
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Display dimensions of the loaded image
  const [imageLoaded, setImageLoaded] = useState(false);
  const [displayDim, setDisplayDim] = useState({ width: 0, height: 0 });

  // Crop box in display coordinates
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });

  // Drag interaction state
  const dragRef = useRef<{
    type: "box" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | null;
    startX: number;
    startY: number;
    initialCrop: CropBox;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    initialCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset transforms whenever a new image is loaded
  useEffect(() => {
    if (imageSrc) {
      setRotation(0);
      setFlipH(false);
      setZoom(1);
      setAspectRatio("free");
      setImageLoaded(false);
      setPreviewUrl(null);
    }
  }, [imageSrc]);

  // Initialize or re-center the crop box based on display dimensions and aspect ratio
  const initCropBox = useCallback(
    (dim: { width: number; height: number }, ratio: AspectRatioOption) => {
      if (dim.width <= 0 || dim.height <= 0) return;

      const padding = 16;
      const maxW = Math.max(40, dim.width - padding * 2);
      const maxH = Math.max(40, dim.height - padding * 2);

      let cropW = maxW * 0.85;
      let cropH = maxH * 0.85;

      if (ratio === "1:1") {
        const side = Math.min(cropW, cropH);
        cropW = side;
        cropH = side;
      } else if (ratio === "4:3") {
        cropH = (cropW * 3) / 4;
        if (cropH > maxH) {
          cropH = maxH;
          cropW = (cropH * 4) / 3;
        }
      } else if (ratio === "16:9") {
        cropH = (cropW * 9) / 16;
        if (cropH > maxH) {
          cropH = maxH;
          cropW = (cropH * 16) / 9;
        }
      } else if (ratio === "3:4") {
        cropW = (cropH * 3) / 4;
        if (cropW > maxW) {
          cropW = maxW;
          cropH = (cropW * 4) / 3;
        }
      }

      const x = Math.max(0, (dim.width - cropW) / 2);
      const y = Math.max(0, (dim.height - cropH) / 2);

      setCrop({ x, y, width: cropW, height: cropH });
    },
    []
  );

  // Handle image load to measure dimensions
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const dim = { width: rect.width, height: rect.height };
    setDisplayDim(dim);
    setImageLoaded(true);
    initCropBox(dim, aspectRatio);
  };

  // Switch aspect ratio
  const handleRatioChange = (newRatio: AspectRatioOption) => {
    setAspectRatio(newRatio);
    if (displayDim.width > 0 && displayDim.height > 0) {
      initCropBox(displayDim, newRatio);
    }
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Flip horizontal
  const handleFlip = () => {
    setFlipH((prev) => !prev);
  };

  // Reset to full view
  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setZoom(1);
    setAspectRatio("free");
    if (displayDim.width > 0) {
      initCropBox(displayDim, "free");
    }
  };

  // Start drag or resize
  const handlePointerDown = (
    e: React.PointerEvent,
    type: "box" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
    setIsDragging(true);

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragRef.current.type || displayDim.width <= 0) return;

      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const init = dragRef.current.initialCrop;
      const t = dragRef.current.type;

      const minSize = 30;
      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      if (t === "box") {
        newX = Math.max(0, Math.min(displayDim.width - init.width, init.x + dx));
        newY = Math.max(0, Math.min(displayDim.height - init.height, init.y + dy));
      } else {
        // Resizing handles
        if (t.includes("e")) {
          newW = Math.max(minSize, Math.min(displayDim.width - init.x, init.width + dx));
        }
        if (t.includes("s")) {
          newH = Math.max(minSize, Math.min(displayDim.height - init.y, init.height + dy));
        }
        if (t.includes("w")) {
          const maxLeftShift = init.width - minSize;
          const clampedDx = Math.max(-init.x, Math.min(maxLeftShift, dx));
          newX = init.x + clampedDx;
          newW = init.width - clampedDx;
        }
        if (t.includes("n")) {
          const maxUpShift = init.height - minSize;
          const clampedDy = Math.max(-init.y, Math.min(maxUpShift, dy));
          newY = init.y + clampedDy;
          newH = init.height - clampedDy;
        }

        // Apply aspect ratio constraints if not "free"
        if (aspectRatio !== "free") {
          let targetRatio = 1;
          if (aspectRatio === "4:3") targetRatio = 4 / 3;
          else if (aspectRatio === "16:9") targetRatio = 16 / 9;
          else if (aspectRatio === "3:4") targetRatio = 3 / 4;

          // Adjust height to match width or vice-versa depending on dragged handle
          if (t === "n" || t === "s") {
            newW = newH * targetRatio;
            if (newX + newW > displayDim.width) {
              newW = displayDim.width - newX;
              newH = newW / targetRatio;
            }
          } else {
            newH = newW / targetRatio;
            if (newY + newH > displayDim.height) {
              newH = displayDim.height - newY;
              newW = newH * targetRatio;
            }
          }
        }
      }

      setCrop({
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
    };

    const onPointerUp = () => {
      dragRef.current.type = null;
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Generate cropped output canvas and export blob
  const generateCroppedBlob = async (): Promise<Blob | null> => {
    const img = imgRef.current;
    if (!img || !imageLoaded || displayDim.width <= 0) return null;

    return new Promise((resolve) => {
      // 1. Create offscreen canvas for the full transformed image (rotation + flip)
      const transformedCanvas = document.createElement("canvas");
      const isSwapped = rotation === 90 || rotation === 270;
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;

      transformedCanvas.width = isSwapped ? naturalH : naturalW;
      transformedCanvas.height = isSwapped ? naturalW : naturalH;

      const tCtx = transformedCanvas.getContext("2d");
      if (!tCtx) {
        resolve(null);
        return;
      }

      tCtx.save();
      tCtx.translate(transformedCanvas.width / 2, transformedCanvas.height / 2);
      tCtx.rotate((rotation * Math.PI) / 180);
      tCtx.scale(flipH ? -1 : 1, 1);
      tCtx.drawImage(img, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
      tCtx.restore();

      // 2. Crop mapping from display coordinates to transformedCanvas coordinates
      const normX = crop.x / displayDim.width;
      const normY = crop.y / displayDim.height;
      const normW = crop.width / displayDim.width;
      const normH = crop.height / displayDim.height;

      const srcX = Math.max(0, normX * transformedCanvas.width);
      const srcY = Math.max(0, normY * transformedCanvas.height);
      const srcW = Math.min(transformedCanvas.width - srcX, normW * transformedCanvas.width);
      const srcH = Math.min(transformedCanvas.height - srcY, normH * transformedCanvas.height);

      // 3. Render cropped area to output canvas (cap at 1000px max dimension)
      const maxOutputDim = 1000;
      let outW = srcW;
      let outH = srcH;
      if (outW > maxOutputDim || outH > maxOutputDim) {
        const ratio = Math.min(maxOutputDim / outW, maxOutputDim / outH);
        outW = Math.round(outW * ratio);
        outH = Math.round(outH * ratio);
      }

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = Math.max(1, outW);
      outputCanvas.height = Math.max(1, outH);

      const outCtx = outputCanvas.getContext("2d");
      if (!outCtx) {
        resolve(null);
        return;
      }

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = "high";
      outCtx.drawImage(transformedCanvas, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      outputCanvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        0.95
      );
    });
  };

  // Update live preview whenever crop changes
  useEffect(() => {
    let active = true;
    if (!imageLoaded || crop.width <= 0) return;

    const timer = setTimeout(async () => {
      const blob = await generateCroppedBlob();
      if (blob && active) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [crop, rotation, flipH, zoom, imageLoaded]);

  const handleApply = async () => {
    const blob = await generateCroppedBlob();
    if (!blob) return;
    await onApplyCrop(blob);
  };

  if (!mounted || !isOpen || !imageSrc) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-[#12131A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-slate-200 z-10"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <Maximize2 size={18} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                  Crop Profile Picture
                </h3>
                <p className="text-xs text-slate-400">
                  Resize and adjust your crop freely as you like
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-8 h-8 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Aspect Ratio & Transform Toolbar */}
          <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between gap-2 select-none">
            {/* Aspect Ratio Scrollable Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar shrink-0 max-w-[70vw] sm:max-w-none">
              <button
                type="button"
                onClick={() => handleRatioChange("free")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  aspectRatio === "free"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                title="Freeform unconstrained crop"
              >
                Free (Not Fixed)
              </button>
              <button
                type="button"
                onClick={() => handleRatioChange("1:1")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  aspectRatio === "1:1"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                1:1 Square
              </button>
              <button
                type="button"
                onClick={() => handleRatioChange("4:3")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  aspectRatio === "4:3"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                4:3
              </button>
              <button
                type="button"
                onClick={() => handleRatioChange("16:9")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  aspectRatio === "16:9"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                16:9
              </button>
              <button
                type="button"
                onClick={() => handleRatioChange("3:4")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  aspectRatio === "3:4"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                3:4
              </button>
            </div>

            {/* Rotation & Flip Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Rotate 90° Clockwise"
              >
                <RotateCw size={15} />
              </button>
              <button
                type="button"
                onClick={handleFlip}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Flip Horizontally"
              >
                <FlipHorizontal size={15} />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Reset Transforms"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Interactive Crop Stage */}
          <div className="relative flex-1 min-h-[260px] sm:min-h-[360px] max-h-[50vh] sm:max-h-[55vh] bg-[#0A0B0E] flex items-center justify-center overflow-hidden p-3 sm:p-4">
            <div
              ref={containerRef}
              className="relative inline-block select-none"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              {/* Underlying Image */}
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Source for cropping"
                onLoad={onImageLoad}
                style={{
                  transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, 1)`,
                  maxHeight: "44vh",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                  pointerEvents: "none",
                }}
                className="rounded-lg shadow-lg"
              />

              {/* Crop Box Overlay */}
              {imageLoaded && displayDim.width > 0 && (
                <>
                  {/* Dimmed Overlay outside the crop box */}
                  <div
                    className="absolute inset-0 pointer-events-none bg-black/65"
                    style={{
                      clipPath: `polygon(
                        0% 0%, 0% 100%, 
                        ${crop.x}px 100%, 
                        ${crop.x}px ${crop.y}px, 
                        ${crop.x + crop.width}px ${crop.y}px, 
                        ${crop.x + crop.width}px ${crop.y + crop.height}px, 
                        ${crop.x}px ${crop.y + crop.height}px, 
                        ${crop.x}px 100%, 
                        100% 100%, 100% 0%
                      )`,
                    }}
                  />

                  {/* Highlighted Draggable Crop Box */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, "box")}
                    className="absolute border-2 border-indigo-400 shadow-2xl cursor-move transition-shadow"
                    style={{
                      left: `${crop.x}px`,
                      top: `${crop.y}px`,
                      width: `${crop.width}px`,
                      height: `${crop.height}px`,
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.25), 0 0 20px rgba(99,102,241,0.4)",
                    }}
                  >
                    {/* 3x3 Rule-of-Thirds Grid */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      <div className="border-r border-b border-white/20" />
                      <div className="border-r border-b border-white/20" />
                      <div className="border-b border-white/20" />
                      <div className="border-r border-b border-white/20" />
                      <div className="border-r border-b border-white/20" />
                      <div className="border-b border-white/20" />
                      <div className="border-r border-white/20" />
                      <div className="border-r border-white/20" />
                      <div />
                    </div>

                    {/* Corner Handles (Large Touch Target) */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "nw")}
                      className="absolute -top-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-10"
                    >
                      <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "ne")}
                      className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-10"
                    >
                      <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "se")}
                      className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-10"
                    >
                      <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "sw")}
                      className="absolute -bottom-3 -left-3 w-6 h-6 flex items-center justify-center cursor-sw-resize z-10"
                    >
                      <div className="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                    </div>

                    {/* Edge Handles */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "n")}
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-ns-resize z-10"
                    >
                      <div className="w-6 h-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "s")}
                      className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-ns-resize z-10"
                    >
                      <div className="w-6 h-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "w")}
                      className="absolute -left-2.5 top-1/2 -translate-y-1/2 h-8 w-4 flex items-center justify-center cursor-ew-resize z-10"
                    >
                      <div className="h-6 w-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                    </div>
                    <div
                      onPointerDown={(e) => handlePointerDown(e, "e")}
                      className="absolute -right-2.5 top-1/2 -translate-y-1/2 h-8 w-4 flex items-center justify-center cursor-ew-resize z-10"
                    >
                      <div className="h-6 w-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Floating Live Circular Preview Badge (Visible on Mobile & Desktop) */}
            {previewUrl && (
              <div className="absolute top-3 right-3 bg-[#12131A]/90 border border-indigo-500/30 rounded-2xl p-2 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1 pointer-events-none z-20">
                <span className="text-[9px] uppercase font-bold text-indigo-300 tracking-wider">
                  Preview
                </span>
                <div className="w-11 h-11 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-indigo-400 shadow-md bg-black/60">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls & Actions */}
          <div className="p-3.5 sm:p-5 border-t border-white/5 bg-[#12131A] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 text-center sm:text-left">
              <Sparkles size={14} className="text-indigo-400 shrink-0" />
              <span>Drag corners to resize & drag inside box to move</span>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition-colors disabled:opacity-50 text-center"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={isSaving || !imageLoaded}
                className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Apply & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
