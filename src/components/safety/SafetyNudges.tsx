"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  X,
  ExternalLink,
  AlertTriangle,
  Eye,
} from "lucide-react";
import {
  SafetyDetection,
  VOICE_ROOM_VIBE_TIPS,
  DM_CHILL_BANNER_COPY,
  splitTextWithLinks,
} from "@/lib/safety-utils";

/* ============================================================================
 * 1. Smart Composer Nudge (PII Soft Warning & IP-Grabber Hard Block)
 * ========================================================================== */
interface SafetyComposerNudgeProps {
  detection: SafetyDetection | null;
  dismissed?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function SafetyComposerNudge({
  detection,
  dismissed = false,
  onDismiss,
  className = "",
}: SafetyComposerNudgeProps) {
  if (!detection) return null;
  if (detection.severity === "nudge" && dismissed) return null;

  const isBlocked = detection.severity === "block";

  return (
    <div
      className={`flex items-start justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] sm:text-xs leading-snug animate-in fade-in slide-in-from-bottom-1 duration-150 ${
        isBlocked
          ? "bg-rose-950/70 border-rose-500/40 text-rose-200"
          : "bg-amber-950/55 border-amber-500/30 text-amber-200/95"
      } ${className}`}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        {isBlocked ? (
          <ShieldAlert size={14} className="text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <Eye size={14} className="text-amber-400 shrink-0 mt-0.5" />
        )}
        <span className="break-words">{detection.message}</span>
      </div>

      {!isBlocked && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-[10px] font-semibold shrink-0 transition-colors cursor-pointer whitespace-nowrap"
          title="Dismiss hint"
        >
          Got it
        </button>
      )}
    </div>
  );
}

/* ============================================================================
 * 2. Rotating Chill Vibe Banner (Voice Room Chat)
 * ========================================================================== */
export function RotatingVibeBanner({
  storageKey = "yapclub_vibe_banner_hidden",
}: {
  storageKey?: string;
}) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * VOICE_ROOM_VIBE_TIPS.length)
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        setIsDismissed(true);
      }
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (isDismissed) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % VOICE_ROOM_VIBE_TIPS.length);
    }, 26000);
    return () => clearInterval(interval);
  }, [isDismissed]);

  if (isDismissed) return null;

  return (
    <div className="mx-3 mt-2.5 px-3 py-2 rounded-xl bg-indigo-500/[0.08] border border-indigo-400/15 flex items-start justify-between gap-2 text-[11px] text-slate-300 leading-snug shrink-0 select-none">
      <div className="flex items-start gap-2 min-w-0">
        <Sparkles size={13} className="text-indigo-400 shrink-0 mt-0.5" />
        <span className="text-slate-300/95">{VOICE_ROOM_VIBE_TIPS[tipIndex]}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          setIsDismissed(true);
          try {
            sessionStorage.setItem(storageKey, "1");
          } catch {}
        }}
        className="text-slate-500 hover:text-slate-200 p-0.5 rounded-md transition-colors shrink-0 cursor-pointer"
        title="Hide vibe tip for this session"
        aria-label="Hide vibe tip"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/* ============================================================================
 * 3. Subtle New-Chat Casual Reminder Pill (Top of Direct Messages)
 * ========================================================================== */
export function NewChatChillBanner({ isGroup = false }: { isGroup?: boolean }) {
  return (
    <div className="w-full flex justify-center my-2 px-2 select-none">
      <div className="max-w-md px-3.5 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-center space-y-0.5 backdrop-blur-sm">
        <div className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-300/90">
          <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
          <span>{isGroup ? "Group Hangout · Keep it chill" : DM_CHILL_BANNER_COPY.title}</span>
        </div>
        <p className="text-[10.5px] text-slate-400 leading-relaxed">
          {isGroup
            ? "Keep group vibes fun and respectful. Avoid dropping private phone numbers, OTPs, or personal info."
            : DM_CHILL_BANNER_COPY.body}
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. Safe Message Text Renderer (External Link Guard + IP-Grabber Shield)
 * ========================================================================== */
interface SafeMessageTextProps {
  text: string;
  isMe?: boolean;
  className?: string;
}

export function SafeMessageText({ text, isMe = false, className = "" }: SafeMessageTextProps) {
  const [pendingLink, setPendingLink] = useState<{ url: string; hostname: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const segments = splitTextWithLinks(text);

  return (
    <>
      <span className={className}>
        {segments.map((seg, idx) => {
          if (seg.type === "text") {
            return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
          }

          if (seg.isBlocked) {
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-medium align-baseline"
                title="Unsafe tracking link blocked by YapClub"
              >
                <ShieldAlert size={11} className="shrink-0" />
                <span>[unsafe link blocked]</span>
              </span>
            );
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPendingLink({ url: seg.value, hostname: seg.hostname || seg.value });
              }}
              className={`inline underline underline-offset-2 break-all cursor-pointer transition-opacity hover:opacity-80 ${
                isMe ? "text-sky-200" : "text-indigo-300"
              }`}
            >
              {seg.value}
            </button>
          );
        })}
      </span>

      {mounted &&
        pendingLink &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setPendingLink(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-[#11131C] border border-white/10 p-5 shadow-2xl space-y-4 text-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white">Leaving YapClub</h3>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Quick heads-up — you&apos;re opening an external site. Only continue if you trust who sent it.
                  </p>
                </div>
              </div>

              <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-indigo-300 break-all">
                {pendingLink.hostname}
                <div className="text-[10px] text-slate-500 mt-1 line-clamp-2 font-sans">
                  {pendingLink.url}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingLink(null)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                >
                  Stay here
                </button>
                <a
                  href={pendingLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPendingLink(null)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/25 transition-colors cursor-pointer"
                >
                  <span>Open link</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
