"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X, Loader2, ShieldAlert } from "lucide-react";

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
  username: string;
}

export function DeleteAccountModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  username,
}: DeleteAccountModalProps) {
  const [mounted, setMounted] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset confirmation input when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmationInput("");
    }
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const isConfirmed = confirmationInput.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    await onConfirm();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Dimmed backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => !isDeleting && onClose()}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-[#12131A] border border-rose-500/20 rounded-[2rem] shadow-2xl overflow-hidden p-6 sm:p-8 flex flex-col text-slate-200 z-10 animate-in zoom-in-95 duration-200">
        {/* Subtle Ambient Red Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Warning Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-950/30">
          <AlertTriangle size={32} className="text-rose-400" />
        </div>

        {/* Header */}
        <div className="text-center mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Delete Account Permanently?
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            This action is irreversible. All of your data associated with{" "}
            <span className="text-white font-semibold">@{username}</span> will be permanently removed.
          </p>
        </div>

        {/* Impact List */}
        <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-4 mb-5 text-left text-xs sm:text-[13px] text-rose-200/90 space-y-2">
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
            <span>Your profile and unique username will be completely erased.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
            <span>All direct messages, chats, and connections will be destroyed.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
            <span>Any custom voice rooms created under your name will be deleted.</span>
          </div>
        </div>

        {/* Confirmation Input */}
        <div className="mb-6 text-left">
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Please type <span className="text-rose-400 font-bold tracking-wide">DELETE</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            disabled={isDeleting}
            placeholder='Type "DELETE"'
            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 focus:border-rose-500/60 focus:ring-2 focus:ring-rose-500/20 rounded-xl text-white placeholder-slate-600 text-sm outline-none transition-all"
            autoFocus
          />
        </div>

        {/* Dual Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95 text-slate-300 font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Keep Account
          </button>
          
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>Delete Account</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
