"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useScreenWakeLock
 * Keeps the device screen awake and prevents it from turning off or going to sleep
 * while an active voice call is in progress.
 *
 * Automatically handles:
 * - Requesting screen wake lock via the Screen Wake Lock API.
 * - Re-acquiring the wake lock when returning to the tab from background/minimization (visibilitychange).
 * - Graceful fallback via an invisible looping canvas video element for older mobile browsers without native WakeLock.
 * - Proper release and cleanup when the call ends or component unmounts.
 */
export function useScreenWakeLock(enabled: boolean = true) {
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined" || !enabled) return;

    // 1. Try Native Screen Wake Lock API
    if ("wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
      try {
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          setIsActive(true);
          return;
        }

        const lock = await (navigator as any).wakeLock.request("screen");
        wakeLockRef.current = lock;
        setIsActive(true);

        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) {
            wakeLockRef.current = null;
          }
          setIsActive(false);
        });
        return;
      } catch (err: any) {
        // NotAllowedError is thrown if battery saver is enabled or low power mode
        console.warn("Screen Wake Lock request notice:", err?.message || err);
      }
    }

    // 2. Fallback for older mobile browsers / WebViews: Tiny invisible looping video
    try {
      if (!fallbackVideoRef.current) {
        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.loop = true;
        video.style.position = "fixed";
        video.style.opacity = "0.001";
        video.style.pointerEvents = "none";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.bottom = "0";
        video.style.left = "0";

        // Create a 1x1 canvas stream for silent zero-bandwidth video
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "rgba(0,0,0,0.01)";
          ctx.fillRect(0, 0, 1, 1);
        }

        if (typeof (canvas as any).captureStream === "function") {
          video.srcObject = (canvas as any).captureStream(1);
        }
        document.body.appendChild(video);
        fallbackVideoRef.current = video;
      }

      if (fallbackVideoRef.current && fallbackVideoRef.current.paused) {
        fallbackVideoRef.current.play().catch(() => {});
        setIsActive(true);
      }
    } catch {
      // Ignore fallback failures safely
    }
  }, [enabled]);

  const releaseWakeLock = useCallback(async () => {
    // 1. Release native wake lock
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore errors during release
      }
      wakeLockRef.current = null;
    }

    // 2. Stop fallback video
    if (fallbackVideoRef.current) {
      try {
        fallbackVideoRef.current.pause();
        if (fallbackVideoRef.current.parentNode) {
          fallbackVideoRef.current.parentNode.removeChild(fallbackVideoRef.current);
        }
      } catch {}
      fallbackVideoRef.current = null;
    }

    setIsActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();

    // The screen wake lock is automatically released by the browser when the page
    // becomes hidden or minimized. When the user returns to the page, re-request it.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { isWakeLockActive: isActive };
}
