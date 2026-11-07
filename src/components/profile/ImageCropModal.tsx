"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Sparkles,
  Loader2,
  RefreshCw,
  Crop,
  Circle,
  Square,
  Image as ImageIcon,
  Smile,
  Move,
} from "lucide-react";

export type AspectRatioOption = "1:1" | "free" | "4:3" | "16:9" | "3:4";
export type CropMode = "easy" | "box";
export type GuideShape = "circle" | "square";

interface CropBox {
  x: number;
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

  // Active Mode: 'easy' (pan & zoom inside avatar circle) vs 'box' (traditional resizable box)
  const [cropMode, setCropMode] = useState<CropMode>("easy");

  // Loaded image metadata
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalDim, setNaturalDim] = useState({ width: 0, height: 0 });

  // Common transforms
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);

  // Responsive Viewport Size for Easy Mode
  const [viewportSize, setViewportSize] = useState(300);

  // ================= EASY AVATAR MODE STATE =================
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoomPercent, setZoomPercent] = useState(100); // 100 = cover scale
  const [guideShape, setGuideShape] = useState<GuideShape>("circle");
  const [isDraggingEasy, setIsDraggingEasy] = useState(false);

  // Touch and pointer tracking for Easy Mode
  const isDraggingEasyRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(100);

  // ================= CUSTOM BOX MODE STATE =================
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>("1:1");
  const [boxDisplayDim, setBoxDisplayDim] = useState({ width: 0, height: 0 });
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const [boxPreviewUrl, setBoxPreviewUrl] = useState<string | null>(null);
  const boxImgRef = useRef<HTMLImageElement>(null);

  const boxDragRef = useRef<{
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

  const [isProcessing, setIsProcessing] = useState(false);

  // Measure window size for responsive viewport
  useEffect(() => {
    setMounted(true);
    const updateViewportSize = () => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 400 || h < 650) {
        setViewportSize(250);
      } else if (w < 640 || h < 750) {
        setViewportSize(280);
      } else {
        setViewportSize(320);
      }
    };
    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  // Load and decode image when imageSrc changes
  useEffect(() => {
    if (!imageSrc) {
      setImgElement(null);
      setImgLoaded(false);
      setNaturalDim({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      setImgElement(img);
      setNaturalDim({ width: img.naturalWidth, height: img.naturalHeight });
      setImgLoaded(true);

      // Reset transforms
      setPan({ x: 0, y: 0 });
      setZoomPercent(100);
      setRotation(0);
      setFlipH(false);
      setCropMode("easy");
      setGuideShape("circle");
    };
    img.onerror = () => {
      console.error("Failed to load image for cropping");
      setImgLoaded(false);
    };
  }, [imageSrc]);

  // Effective dimensions considering rotation
  const isSwapped = rotation === 90 || rotation === 270;
  const effectiveW = isSwapped ? naturalDim.height : naturalDim.width;
  const effectiveH = isSwapped ? naturalDim.width : naturalDim.height;

  // Base scales for Easy Mode
  const { coverScale, fitScale, minZoomPercent } = useMemo(() => {
    if (effectiveW <= 0 || effectiveH <= 0) {
      return { coverScale: 1, fitScale: 1, minZoomPercent: 40 };
    }
    const cScale = Math.max(viewportSize / effectiveW, viewportSize / effectiveH);
    const fScale = Math.min(viewportSize / effectiveW, viewportSize / effectiveH);
    const minZ = Math.max(30, Math.round((fScale / cScale) * 80));
    return { coverScale: cScale, fitScale: fScale, minZoomPercent: minZ };
  }, [effectiveW, effectiveH, viewportSize]);

  // Current scale in Easy Mode
  const currentEasyScale = coverScale * (zoomPercent / 100);

  // Initialize Box Crop overlay when box display dimensions change
  const initBoxCrop = useCallback(
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

      setCropBox({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(cropW),
        height: Math.round(cropH),
      });
    },
    []
  );

  const onBoxImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const dim = { width: rect.width, height: rect.height };
    setBoxDisplayDim(dim);
    initBoxCrop(dim, aspectRatio);
  };

  const handleRatioChange = (newRatio: AspectRatioOption) => {
    setAspectRatio(newRatio);
    if (boxDisplayDim.width > 0 && boxDisplayDim.height > 0) {
      initBoxCrop(boxDisplayDim, newRatio);
    }
  };

  // Quick Action Handlers
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleFlip = () => {
    setFlipH((prev) => !prev);
  };

  const handleFitPhoto = () => {
    const fitPercent = Math.max(minZoomPercent, Math.round((fitScale / coverScale) * 100));
    setZoomPercent(fitPercent);
    setPan({ x: 0, y: 0 });
  };

  const handleFillCircle = () => {
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setPan({ x: 0, y: 0 });
    setZoomPercent(100);
    setRotation(0);
    setFlipH(false);
    if (boxDisplayDim.width > 0) {
      initBoxCrop(boxDisplayDim, "1:1");
    }
  };

  // ================= EASY AVATAR POINTER / TOUCH DRAGGING =================
  const handleEasyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      isDraggingEasyRef.current = true;
      setIsDraggingEasy(true);
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    } else if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoomPercent;
    }
  };

  const handleEasyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Handle 2-finger pinch-to-zoom on touchscreens
    if (activePointersRef.current.size === 2 && pinchStartDistRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDistRef.current > 0) {
        const ratio = currentDist / pinchStartDistRef.current;
        const newZoom = Math.round(
          Math.min(350, Math.max(minZoomPercent, pinchStartZoomRef.current * ratio))
        );
        setZoomPercent(newZoom);
      }
      return;
    }

    // Handle 1-finger / mouse panning
    if (isDraggingEasyRef.current && activePointersRef.current.size === 1) {
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;

      // Clamping to avoid panning image offscreen
      const maxPan = Math.max(viewportSize * 1.2, (effectiveW * currentEasyScale) / 2);
      const nextX = Math.min(maxPan, Math.max(-maxPan, panStartRef.current.x + dx));
      const nextY = Math.min(maxPan, Math.max(-maxPan, panStartRef.current.y + dy));

      setPan({ x: nextX, y: nextY });
    }
  };

  const handleEasyPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      isDraggingEasyRef.current = false;
      setIsDraggingEasy(false);
    }
  };

  // Mouse wheel zoom
  const handleEasyWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 8 : -8;
    setZoomPercent((prev) => Math.min(350, Math.max(minZoomPercent, prev + step)));
  };

  // ================= CUSTOM BOX MODE DRAGGING & RESIZING =================
  const handleBoxPointerDown = (
    e: React.PointerEvent,
    type: "box" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    boxDragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...cropBox },
    };
    setIsDraggingBox(true);

    const onPointerMove = (ev: PointerEvent) => {
      if (!boxDragRef.current.type || boxDisplayDim.width <= 0) return;

      const dx = ev.clientX - boxDragRef.current.startX;
      const dy = ev.clientY - boxDragRef.current.startY;
      const init = boxDragRef.current.initialCrop;
      const t = boxDragRef.current.type;

      const minSize = 40;
      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      const targetRatio =
        aspectRatio === "1:1"
          ? 1
          : aspectRatio === "4:3"
          ? 4 / 3
          : aspectRatio === "16:9"
          ? 16 / 9
          : aspectRatio === "3:4"
          ? 3 / 4
          : null;

      if (t === "box") {
        newX = Math.max(0, Math.min(boxDisplayDim.width - init.width, init.x + dx));
        newY = Math.max(0, Math.min(boxDisplayDim.height - init.height, init.y + dy));
      } else if (t === "se") {
        // Anchor: Top-Left (init.x, init.y)
        newW = Math.max(minSize, Math.min(boxDisplayDim.width - init.x, init.width + dx));
        newH = Math.max(minSize, Math.min(boxDisplayDim.height - init.y, init.height + dy));
        if (targetRatio) {
          newH = newW / targetRatio;
          if (init.y + newH > boxDisplayDim.height) {
            newH = boxDisplayDim.height - init.y;
            newW = newH * targetRatio;
          }
        }
      } else if (t === "nw") {
        // Anchor: Bottom-Right (init.x + init.width, init.y + init.height)
        const anchorX = init.x + init.width;
        const anchorY = init.y + init.height;
        newW = Math.max(minSize, Math.min(anchorX, init.width - dx));
        newH = Math.max(minSize, Math.min(anchorY, init.height - dy));
        if (targetRatio) {
          newH = newW / targetRatio;
          if (anchorY - newH < 0) {
            newH = anchorY;
            newW = newH * targetRatio;
          }
        }
        newX = anchorX - newW;
        newY = anchorY - newH;
      } else if (t === "ne") {
        // Anchor: Bottom-Left (init.x, init.y + init.height)
        const anchorX = init.x;
        const anchorY = init.y + init.height;
        newW = Math.max(minSize, Math.min(boxDisplayDim.width - anchorX, init.width + dx));
        newH = Math.max(minSize, Math.min(anchorY, init.height - dy));
        if (targetRatio) {
          newH = newW / targetRatio;
          if (anchorY - newH < 0) {
            newH = anchorY;
            newW = newH * targetRatio;
          }
        }
        newX = anchorX;
        newY = anchorY - newH;
      } else if (t === "sw") {
        // Anchor: Top-Right (init.x + init.width, init.y)
        const anchorX = init.x + init.width;
        const anchorY = init.y;
        newW = Math.max(minSize, Math.min(anchorX, init.width - dx));
        newH = Math.max(minSize, Math.min(boxDisplayDim.height - anchorY, init.height + dy));
        if (targetRatio) {
          newH = newW / targetRatio;
          if (anchorY + newH > boxDisplayDim.height) {
            newH = boxDisplayDim.height - anchorY;
            newW = newH * targetRatio;
          }
        }
        newX = anchorX - newW;
        newY = anchorY;
      } else if (t === "e") {
        newW = Math.max(minSize, Math.min(boxDisplayDim.width - init.x, init.width + dx));
        if (targetRatio) {
          newH = newW / targetRatio;
          const deltaH = newH - init.height;
          newY = Math.max(0, Math.min(boxDisplayDim.height - newH, init.y - deltaH / 2));
        }
      } else if (t === "w") {
        const anchorX = init.x + init.width;
        newW = Math.max(minSize, Math.min(anchorX, init.width - dx));
        newX = anchorX - newW;
        if (targetRatio) {
          newH = newW / targetRatio;
          const deltaH = newH - init.height;
          newY = Math.max(0, Math.min(boxDisplayDim.height - newH, init.y - deltaH / 2));
        }
      } else if (t === "s") {
        newH = Math.max(minSize, Math.min(boxDisplayDim.height - init.y, init.height + dy));
        if (targetRatio) {
          newW = newH * targetRatio;
          const deltaW = newW - init.width;
          newX = Math.max(0, Math.min(boxDisplayDim.width - newW, init.x - deltaW / 2));
        }
      } else if (t === "n") {
        const anchorY = init.y + init.height;
        newH = Math.max(minSize, Math.min(anchorY, init.height - dy));
        newY = anchorY - newH;
        if (targetRatio) {
          newW = newH * targetRatio;
          const deltaW = newW - init.width;
          newX = Math.max(0, Math.min(boxDisplayDim.width - newW, init.x - deltaW / 2));
        }
      }

      setCropBox({
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
    };

    const onPointerUp = () => {
      boxDragRef.current.type = null;
      setIsDraggingBox(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // ================= CANVAS EXPORT BLOB GENERATORS =================

  // 1. Easy Avatar Mode Export: Crisp 600x600 Avatar
  const generateEasyCroppedBlob = async (): Promise<Blob | null> => {
    if (!imgElement || !naturalDim.width || !naturalDim.height) return null;

    return new Promise((resolve) => {
      const OUT_SIZE = 600;
      const canvas = document.createElement("canvas");
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Dark background for any empty space if zoomed out
      ctx.fillStyle = "#12131A";
      ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);

      const s = OUT_SIZE / viewportSize;

      ctx.save();
      // Translate to canvas center plus scaled pan
      ctx.translate(OUT_SIZE / 2 + pan.x * s, OUT_SIZE / 2 + pan.y * s);

      // Rotate around center
      ctx.rotate((rotation * Math.PI) / 180);

      // Flip horizontal if active
      ctx.scale(flipH ? -1 : 1, 1);

      // Scale
      const drawScale = currentEasyScale * s;
      ctx.scale(drawScale, drawScale);

      // Draw original image centered
      ctx.drawImage(
        imgElement,
        -naturalDim.width / 2,
        -naturalDim.height / 2,
        naturalDim.width,
        naturalDim.height
      );

      ctx.restore();

      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  // 2. Custom Box Mode Export: Accurately maps box bounds
  const generateBoxCroppedBlob = async (): Promise<Blob | null> => {
    if (!imgElement || !boxDisplayDim.width || !boxDisplayDim.height) return null;

    return new Promise((resolve) => {
      // Step A: Draw transformed full image to offscreen canvas
      const tCanvas = document.createElement("canvas");
      const tW = isSwapped ? naturalDim.height : naturalDim.width;
      const tH = isSwapped ? naturalDim.width : naturalDim.height;
      tCanvas.width = tW;
      tCanvas.height = tH;
      const tCtx = tCanvas.getContext("2d");
      if (!tCtx) {
        resolve(null);
        return;
      }

      tCtx.save();
      tCtx.translate(tW / 2, tH / 2);
      tCtx.rotate((rotation * Math.PI) / 180);
      tCtx.scale(flipH ? -1 : 1, 1);
      tCtx.drawImage(
        imgElement,
        -naturalDim.width / 2,
        -naturalDim.height / 2,
        naturalDim.width,
        naturalDim.height
      );
      tCtx.restore();

      // Step B: Map normalized crop coordinates
      const normX = cropBox.x / boxDisplayDim.width;
      const normY = cropBox.y / boxDisplayDim.height;
      const normW = cropBox.width / boxDisplayDim.width;
      const normH = cropBox.height / boxDisplayDim.height;

      const sx = Math.max(0, normX * tW);
      const sy = Math.max(0, normY * tH);
      const sw = Math.min(tW - sx, normW * tW);
      const sh = Math.min(tH - sy, normH * tH);

      // Step C: Render cropped area to output canvas (cap at 800px)
      const MAX_OUT = 800;
      let outW = sw;
      let outH = sh;
      if (outW > MAX_OUT || outH > MAX_OUT) {
        const ratio = Math.min(MAX_OUT / outW, MAX_OUT / outH);
        outW = Math.round(outW * ratio);
        outH = Math.round(outH * ratio);
      }

      const outCanvas = document.createElement("canvas");
      outCanvas.width = Math.max(1, Math.round(outW));
      outCanvas.height = Math.max(1, Math.round(outH));
      const outCtx = outCanvas.getContext("2d");
      if (!outCtx) {
        resolve(null);
        return;
      }

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = "high";
      outCtx.drawImage(tCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      outCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  // 3. "Use Full Photo" 1-Click Export: Centers whole photo onto clean 1:1 canvas
  const generateFullPhotoBlob = async (): Promise<Blob | null> => {
    if (!imgElement || !naturalDim.width || !naturalDim.height) return null;

    return new Promise((resolve) => {
      const OUT_SIZE = Math.min(800, Math.max(naturalDim.width, naturalDim.height));
      const canvas = document.createElement("canvas");
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Fill with dark YapClub theme color
      ctx.fillStyle = "#12131A";
      ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);

      const scale = Math.min(OUT_SIZE / effectiveW, OUT_SIZE / effectiveH);

      ctx.save();
      ctx.translate(OUT_SIZE / 2, OUT_SIZE / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, 1);
      ctx.scale(scale, scale);
      ctx.drawImage(
        imgElement,
        -naturalDim.width / 2,
        -naturalDim.height / 2,
        naturalDim.width,
        naturalDim.height
      );
      ctx.restore();

      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  // Debounced live preview for Custom Box Mode
  useEffect(() => {
    let active = true;
    if (cropMode !== "box" || !imgLoaded || cropBox.width <= 0) return;

    const timer = setTimeout(async () => {
      const blob = await generateBoxCroppedBlob();
      if (blob && active) {
        const url = URL.createObjectURL(blob);
        setBoxPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropBox, rotation, flipH, cropMode, imgLoaded]);

  // Handle Apply button
  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const blob =
        cropMode === "easy"
          ? await generateEasyCroppedBlob()
          : await generateBoxCroppedBlob();
      if (blob) {
        await onApplyCrop(blob);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Use Full Photo button
  const handleUseFullPhoto = async () => {
    setIsProcessing(true);
    try {
      const blob = await generateFullPhotoBlob();
      if (blob) {
        await onApplyCrop(blob);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!mounted || !isOpen || !imageSrc) return null;

  const PREVIEW_SIZE = 64; // Size of corner live preview badge

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Dialog Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl max-h-[94vh] flex flex-col bg-[#12131A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-slate-200 z-10"
        >
          {/* HEADER */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Crop size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                  Set Profile Picture
                </h3>
                <p className="text-xs text-slate-400 truncate">
                  {cropMode === "easy"
                    ? "Drag photo to position & zoom to fit"
                    : "Adjust custom crop box corners"}
                </p>
              </div>
            </div>

            {/* Mode Toggle Switch */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => setCropMode("easy")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  cropMode === "easy"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Easy Drag & Zoom mode"
              >
                <Smile size={13} />
                <span>Easy</span>
              </button>
              <button
                type="button"
                onClick={() => setCropMode("box")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  cropMode === "box"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Custom box resize mode"
              >
                <Maximize2 size={13} />
                <span>Custom Box</span>
              </button>
            </div>

            <button
              onClick={onClose}
              disabled={isSaving || isProcessing}
              className="w-8 h-8 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* SECONDARY TOOLBAR */}
          <div className="px-3 sm:px-5 py-2 bg-black/40 border-b border-white/5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {cropMode === "easy" ? (
              /* Easy Mode: Shape Guide Toggle */
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline mr-1">
                  Preview Shape:
                </span>
                <button
                  type="button"
                  onClick={() => setGuideShape("circle")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    guideShape === "circle"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <Circle size={13} />
                  <span>Circle (Profile)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuideShape("square")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    guideShape === "square"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <Square size={13} />
                  <span>Square</span>
                </button>
              </div>
            ) : (
              /* Custom Box Mode: Aspect Ratio Pills */
              <div className="flex items-center gap-1.5">
                {(["1:1", "free", "4:3", "16:9", "3:4"] as AspectRatioOption[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRatioChange(r)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      aspectRatio === r
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {r === "1:1" ? "1:1 Square" : r === "free" ? "Free" : r}
                  </button>
                ))}
              </div>
            )}

            {/* Rotation & Flip Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Rotate 90° Clockwise"
              >
                <RotateCw size={15} />
              </button>
              <button
                type="button"
                onClick={handleFlip}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Flip Horizontally"
              >
                <FlipHorizontal size={15} />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Reset Position & Transforms"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* MAIN CROPPING STAGE */}
          <div className="relative flex-1 min-h-[300px] sm:min-h-[380px] bg-[#0A0B0E] flex items-center justify-center overflow-hidden p-3 select-none">
            {cropMode === "easy" ? (
              /* ================= MODE 1: EASY AVATAR (PAN & ZOOM) ================= */
              <div
                className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
                style={{
                  width: `${viewportSize}px`,
                  height: `${viewportSize}px`,
                }}
                onPointerDown={handleEasyPointerDown}
                onPointerMove={handleEasyPointerMove}
                onPointerUp={handleEasyPointerUp}
                onPointerCancel={handleEasyPointerUp}
                onWheel={handleEasyWheel}
              >
                {/* Underlying Transformed Image */}
                {imgLoaded && imgElement && (
                  <img
                    src={imageSrc}
                    alt="Source for profile crop"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: `${naturalDim.width}px`,
                      height: `${naturalDim.height}px`,
                      maxWidth: "none",
                      maxHeight: "none",
                      transformOrigin: "center center",
                      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${
                        flipH ? -currentEasyScale : currentEasyScale
                      }, ${currentEasyScale})`,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                )}

                {/* SVG Vignette Mask with Transparent Cutout */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-10"
                  viewBox={`0 0 ${viewportSize} ${viewportSize}`}
                >
                  <defs>
                    <mask id="avatar-crop-cutout">
                      {/* White: visible overlay */}
                      <rect width="100%" height="100%" fill="white" />
                      {/* Black: transparent hole */}
                      {guideShape === "circle" ? (
                        <circle
                          cx={viewportSize / 2}
                          cy={viewportSize / 2}
                          r={viewportSize / 2 - 8}
                          fill="black"
                        />
                      ) : (
                        <rect
                          x={10}
                          y={10}
                          width={viewportSize - 20}
                          height={viewportSize - 20}
                          rx={24}
                          fill="black"
                        />
                      )}
                    </mask>
                  </defs>

                  {/* Darkened backdrop outside avatar shape */}
                  <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.72)"
                    mask="url(#avatar-crop-cutout)"
                  />

                  {/* Highlighting Glowing Guide Border */}
                  {guideShape === "circle" ? (
                    <circle
                      cx={viewportSize / 2}
                      cy={viewportSize / 2}
                      r={viewportSize / 2 - 8}
                      fill="none"
                      stroke={isDraggingEasy ? "rgba(129, 140, 248, 0.95)" : "rgba(99, 102, 241, 0.7)"}
                      strokeWidth="2.5"
                      strokeDasharray={isDraggingEasy ? "6 4" : "none"}
                    />
                  ) : (
                    <rect
                      x={10}
                      y={10}
                      width={viewportSize - 20}
                      height={viewportSize - 20}
                      rx={24}
                      fill="none"
                      stroke={isDraggingEasy ? "rgba(129, 140, 248, 0.95)" : "rgba(99, 102, 241, 0.7)"}
                      strokeWidth="2.5"
                      strokeDasharray={isDraggingEasy ? "6 4" : "none"}
                    />
                  )}

                  {/* Rule of Thirds Guide Lines (Visible when dragging) */}
                  {isDraggingEasy && (
                    <g stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1" strokeDasharray="3 3">
                      <line
                        x1={viewportSize * 0.333}
                        y1={12}
                        x2={viewportSize * 0.333}
                        y2={viewportSize - 12}
                      />
                      <line
                        x1={viewportSize * 0.666}
                        y1={12}
                        x2={viewportSize * 0.666}
                        y2={viewportSize - 12}
                      />
                      <line
                        x1={12}
                        y1={viewportSize * 0.333}
                        x2={viewportSize - 12}
                        y2={viewportSize * 0.333}
                      />
                      <line
                        x1={12}
                        y1={viewportSize * 0.666}
                        x2={viewportSize - 12}
                        y2={viewportSize * 0.666}
                      />
                    </g>
                  )}
                </svg>

                {/* Real-time Circular Preview Bubble in Corner */}
                <div className="absolute top-2.5 right-2.5 bg-[#12131A]/90 border border-white/10 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1 pointer-events-none z-20">
                  <span className="text-[8px] uppercase font-bold text-indigo-300 tracking-wider">
                    Preview
                  </span>
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-indigo-400 shadow-md bg-black relative">
                    {imgLoaded && imgElement && (
                      <img
                        src={imageSrc}
                        alt="Mini avatar preview"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          width: `${naturalDim.width}px`,
                          height: `${naturalDim.height}px`,
                          maxWidth: "none",
                          maxHeight: "none",
                          transformOrigin: "center center",
                          transform: `translate(-50%, -50%) translate(${
                            pan.x * (PREVIEW_SIZE / viewportSize)
                          }px, ${pan.y * (PREVIEW_SIZE / viewportSize)}px) rotate(${rotation}deg) scale(${
                            flipH
                              ? -currentEasyScale * (PREVIEW_SIZE / viewportSize)
                              : currentEasyScale * (PREVIEW_SIZE / viewportSize)
                          }, ${currentEasyScale * (PREVIEW_SIZE / viewportSize)})`,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ================= MODE 2: CUSTOM BOX CROP ================= */
              <div className="relative inline-block select-none max-w-full max-h-full">
                <img
                  ref={boxImgRef}
                  src={imageSrc}
                  alt="Custom crop source"
                  onLoad={onBoxImageLoad}
                  style={{
                    transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, 1)`,
                    maxHeight: "45vh",
                    maxWidth: "100%",
                    objectFit: "contain",
                    display: "block",
                    pointerEvents: "none",
                  }}
                  className="rounded-lg shadow-lg"
                />

                {imgLoaded && boxDisplayDim.width > 0 && (
                  <>
                    {/* Dimmed Overlay outside the crop box */}
                    <div
                      className="absolute inset-0 pointer-events-none bg-black/65"
                      style={{
                        clipPath: `polygon(
                          0% 0%, 0% 100%, 
                          ${cropBox.x}px 100%, 
                          ${cropBox.x}px ${cropBox.y}px, 
                          ${cropBox.x + cropBox.width}px ${cropBox.y}px, 
                          ${cropBox.x + cropBox.width}px ${cropBox.y + cropBox.height}px, 
                          ${cropBox.x}px ${cropBox.y + cropBox.height}px, 
                          ${cropBox.x}px 100%, 
                          100% 100%, 100% 0%
                        )`,
                      }}
                    />

                    {/* Draggable Highlighted Crop Box */}
                    <div
                      onPointerDown={(e) => handleBoxPointerDown(e, "box")}
                      className="absolute border-2 border-indigo-400 shadow-2xl cursor-move touch-none"
                      style={{
                        left: `${cropBox.x}px`,
                        top: `${cropBox.y}px`,
                        width: `${cropBox.width}px`,
                        height: `${cropBox.height}px`,
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.25), 0 0 20px rgba(99,102,241,0.4)",
                      }}
                    >
                      {/* 3x3 Grid */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                        <div className="border-r border-b border-white/20" />
                        <div className="border-r border-b border-white/20" />
                        <div className="border-b border-white/20" />
                        <div className="border-r border-b border-white/20" />
                        <div className="border-r border-b border-white/20" />
                        <div className="border-b border-white/20" />
                        <div className="border-r border-b border-white/20" />
                        <div className="border-r border-b border-white/20" />
                        <div />
                      </div>

                      {/* Corner Handles (Large 38px Touch Targets) */}
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "nw")}
                        className="absolute -top-4 -left-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize z-20 touch-none"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "ne")}
                        className="absolute -top-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nesw-resize z-20 touch-none"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "se")}
                        className="absolute -bottom-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize z-20 touch-none"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "sw")}
                        className="absolute -bottom-4 -left-4 w-9 h-9 flex items-center justify-center cursor-sw-resize z-20 touch-none"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                      </div>

                      {/* Edge Handles */}
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "n")}
                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize z-10 touch-none"
                      >
                        <div className="w-7 h-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "s")}
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-10 h-6 flex items-center justify-center cursor-ns-resize z-10 touch-none"
                      >
                        <div className="w-7 h-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "w")}
                        className="absolute -left-3 top-1/2 -translate-y-1/2 h-10 w-6 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                      >
                        <div className="h-7 w-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                      </div>
                      <div
                        onPointerDown={(e) => handleBoxPointerDown(e, "e")}
                        className="absolute -right-3 top-1/2 -translate-y-1/2 h-10 w-6 flex items-center justify-center cursor-ew-resize z-10 touch-none"
                      >
                        <div className="h-7 w-1.5 bg-white border border-indigo-600 rounded-full shadow-md" />
                      </div>
                    </div>
                  </>
                )}

                {/* Floating Preview in Box Mode */}
                {boxPreviewUrl && (
                  <div className="absolute top-3 right-3 bg-[#12131A]/90 border border-indigo-500/30 rounded-2xl p-2 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1 pointer-events-none z-20">
                    <span className="text-[9px] uppercase font-bold text-indigo-300 tracking-wider">
                      Preview
                    </span>
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-indigo-400 shadow-md bg-black">
                      <img
                        src={boxPreviewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* EASY MODE CONTROLS: ZOOM SLIDER & QUICK FIT PRESETS */}
          {cropMode === "easy" && (
            <div className="px-4 py-3 bg-[#0E0F14] border-t border-white/5 space-y-2.5">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Zoom Slider */}
                <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setZoomPercent((prev) => Math.max(minZoomPercent, prev - 10))
                    }
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut size={15} />
                  </button>

                  <input
                    type="range"
                    min={minZoomPercent}
                    max={300}
                    step={2}
                    value={zoomPercent}
                    onChange={(e) => setZoomPercent(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => setZoomPercent((prev) => Math.min(300, prev + 10))}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn size={15} />
                  </button>

                  <span className="text-[11px] font-mono font-semibold text-slate-400 min-w-[36px] text-right">
                    {zoomPercent}%
                  </span>
                </div>

                {/* Quick Fit Pills */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleFitPhoto}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    title="Scale photo so entire picture fits in avatar"
                  >
                    <Maximize2 size={13} className="text-indigo-400" />
                    <span>Fit Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFillCircle}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    title="Fill the avatar circle completely"
                  >
                    <Circle size={13} className="text-indigo-400" />
                    <span>Fill Circle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPan({ x: 0, y: 0 })}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    title="Center photo"
                  >
                    <Move size={13} className="text-indigo-400" />
                    <span>Center</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="p-3.5 sm:p-5 border-t border-white/5 bg-[#12131A] flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Quick 1-Click "Use Full Photo" Button */}
            <button
              type="button"
              onClick={handleUseFullPhoto}
              disabled={isSaving || isProcessing || !imgLoaded}
              className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Skip cropping and use the entire uncropped photo"
            >
              <ImageIcon size={15} className="text-indigo-400" />
              <span>Use Full Photo (No Crop)</span>
            </button>

            {/* Cancel & Save Buttons */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isProcessing}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition-colors disabled:opacity-50 text-center cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={isSaving || isProcessing || !imgLoaded}
                className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSaving || isProcessing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Save Avatar</span>
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
