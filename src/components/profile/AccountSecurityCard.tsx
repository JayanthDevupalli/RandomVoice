"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { generateRecoveryCode } from "@/lib/recovery-utils";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Download,
  AlertTriangle,
  KeyRound,
  Loader2,
} from "lucide-react";

interface AccountSecurityCardProps {
  userId: string;
  username: string;
  initialRecoveryCode?: string | null;
  onCodeUpdated?: (newCode: string) => void;
}

export function AccountSecurityCard({
  userId,
  username,
  initialRecoveryCode,
  onCodeUpdated,
}: AccountSecurityCardProps) {
  const [recoveryCode, setRecoveryCode] = useState<string | null>(initialRecoveryCode || null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Copy code to clipboard
  const handleCopy = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Download code as text file
  const handleDownload = () => {
    if (!recoveryCode) return;
    const content =
      `=====================================\n` +
      `YAPCLUB ACCOUNT RECOVERY CODE\n` +
      `=====================================\n\n` +
      `Username: ${username}\n` +
      `Recovery Code: ${recoveryCode}\n` +
      `Date Generated: ${new Date().toLocaleString()}\n\n` +
      `Keep this code in a secure location. If you forget your password,\n` +
      `this code is required to recover your account.\n` +
      `=====================================\n`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yapclub-recovery-code-${username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate or regenerate code and save to Supabase
  const handleSaveNewCode = async () => {
    setIsRegenerating(true);
    setStatusMessage(null);

    const newCode = generateRecoveryCode();

    try {
      // First try updating recovery_code column directly
      let updateResult = await supabase
        .from("profiles")
        .update({ recovery_code: newCode })
        .eq("id", userId);

      // If column doesn't exist yet, fallback to social_links JSONB
      if (updateResult.error && updateResult.error.message.includes("recovery_code")) {
        const { data: currentProfile } = await supabase
          .from("profiles")
          .select("social_links")
          .eq("id", userId)
          .single();

        const currentLinks = currentProfile?.social_links || {};
        updateResult = await supabase
          .from("profiles")
          .update({
            social_links: {
              ...currentLinks,
              recovery_code: newCode,
            },
          })
          .eq("id", userId);
      }

      if (updateResult.error) {
        throw updateResult.error;
      }

      setRecoveryCode(newCode);
      setIsRevealed(true);
      setShowConfirmRegen(false);
      setStatusMessage("New recovery code generated & saved!");
      if (onCodeUpdated) onCodeUpdated(newCode);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error("Failed to save recovery code:", err);
      setStatusMessage("Failed to save recovery code. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="w-full bg-[#12131A]/90 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-left relative overflow-hidden shadow-xl backdrop-blur-xl">
      {/* Background Subtle Accent */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
              Recovery Code
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Reset password if forgotten
            </p>
          </div>
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full shrink-0">
          Security
        </span>
      </div>

      {statusMessage && (
        <div className="mb-3 p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
          <KeyRound size={14} className="shrink-0" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {recoveryCode ? (
        <div className="space-y-2.5">
          {/* Recovery Code Display Box */}
          <div className="flex items-center justify-between gap-2 bg-black/50 border border-white/5 rounded-xl p-2.5 sm:p-3.5">
            <div className="min-w-0 flex-1 overflow-hidden">
              {isRevealed ? (
                <div className="font-mono text-xs sm:text-sm md:text-base font-semibold text-amber-300 select-all tracking-wider whitespace-nowrap overflow-x-auto py-0.5">
                  {recoveryCode}
                </div>
              ) : (
                <div className="font-mono text-xs sm:text-sm font-semibold text-slate-500 tracking-wider whitespace-nowrap select-none py-0.5">
                  •••• •••• •••• ••••
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsRevealed(!isRevealed)}
                className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title={isRevealed ? "Hide Code" : "Reveal Code"}
              >
                {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Copy Recovery Code"
              >
                {isCopied ? (
                  <Check size={15} className="text-emerald-400" />
                ) : (
                  <Copy size={15} />
                )}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Download backup text file"
              >
                <Download size={15} />
              </button>
            </div>
          </div>

          {/* Regenerate Warning / Confirm */}
          {showConfirmRegen ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
              <div className="flex items-start gap-2 text-[11px] sm:text-xs text-amber-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Generating a new code will immediately invalidate your old code. Save the new one!
                </span>
              </div>
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowConfirmRegen(false)}
                  disabled={isRegenerating}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewCode}
                  disabled={isRegenerating}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                >
                  {isRegenerating && <Loader2 size={12} className="animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 pt-0.5">
              <span className="truncate pr-2">Keep this code secret.</span>
              <button
                type="button"
                onClick={() => setShowConfirmRegen(true)}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300 transition-colors shrink-0"
              >
                <RefreshCw size={11} />
                <span>Regenerate</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-xs text-slate-400 mb-2.5">
            You don't have a recovery code yet. Generate one now to protect your account.
          </p>
          <button
            type="button"
            onClick={handleSaveNewCode}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-semibold transition-all active:scale-95"
          >
            {isRegenerating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <KeyRound size={13} />
            )}
            Generate Recovery Code
          </button>
        </div>
      )}
    </div>
  );
}
