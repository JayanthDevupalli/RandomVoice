"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Copy, Check, Download, AlertTriangle, X } from "lucide-react";

interface RecoveryCodeModalProps {
  isOpen: boolean;
  recoveryCode: string;
  username: string;
  onClose: () => void;
}

export function RecoveryCodeModal({
  isOpen,
  recoveryCode,
  username,
  onClose,
}: RecoveryCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const textContent = `=====================================\n` +
      `YAPCLUB ACCOUNT RECOVERY CODE\n` +
      `=====================================\n\n` +
      `Username: ${username}\n` +
      `Recovery Code: ${recoveryCode}\n` +
      `Date Generated: ${new Date().toLocaleString()}\n\n` +
      `IMPORTANT:\n` +
      `Keep this code in a secure location (e.g. password manager).\n` +
      `If you ever forget your password, you will need this recovery\n` +
      `code to reset your password and regain access to your account.\n` +
      `=====================================\n`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yapclub-recovery-code-${username || "user"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-[#12131A] border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden z-10 text-slate-200"
        >
          {/* Subtle Glow */}
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>

          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/10">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-xl font-bold text-white mb-1.5">Save Your Recovery Code</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Because YapClub does not collect personal emails, this code is the{" "}
              <span className="text-amber-400 font-semibold">only way</span> to recover your
              account if you forget your password.
            </p>
          </div>

          {/* Recovery Code Display Box */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4 mb-4 text-center relative group">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1 block">
              Your Secret Recovery Code
            </span>
            <div className="font-mono text-xl sm:text-2xl font-bold text-white tracking-widest my-1 select-all selection:bg-amber-500/30">
              {recoveryCode}
            </div>
            <p className="text-xs text-slate-400 mt-1">Username: {username}</p>
          </div>

          {/* Action Buttons: Copy & Download */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-sm transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={16} className="text-slate-400" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-sm transition-all active:scale-95"
            >
              <Download size={16} className="text-slate-400" />
              <span>Download .txt</span>
            </button>
          </div>

          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs mb-6 leading-relaxed">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>
              Save this code in a secure place. If you lose your password and don't have this code,
              your account cannot be recovered.
            </span>
          </div>

          {/* Confirmation Button */}
          <button
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-98"
          >
            I Have Saved My Recovery Code
          </button>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
