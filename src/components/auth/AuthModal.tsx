"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, User, Loader2, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";
import { generateRecoveryCode } from "@/lib/recovery-utils";
import { RecoveryCodeModal } from "./RecoveryCodeModal";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = "login" | "signup" | "recover";

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // New recovery code generated during signup to display in modal
  const [newlyCreatedRecoveryCode, setNewlyCreatedRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetFields = () => {
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setRecoveryCodeInput("");
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    resetFields();
    setMode(newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const cleanUsername = username.trim();
    const fakeEmail = `${cleanUsername.toLowerCase()}@users.yapclub.com`;

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password,
        });
        if (signInError) throw signInError;
        window.location.reload();
      } else if (mode === "signup") {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email: fakeEmail,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          const generatedCode = generateRecoveryCode();

          // Try inserting with recovery_code column
          let { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              username: cleanUsername,
              avatar: "zap",
              recovery_code: generatedCode,
              social_links: { recovery_code: generatedCode },
            });

          // Fallback if column recovery_code has not been migrated yet
          if (profileError && profileError.message.includes("recovery_code")) {
            const fallback = await supabase
              .from("profiles")
              .insert({
                id: data.user.id,
                username: cleanUsername,
                avatar: "zap",
                social_links: { recovery_code: generatedCode },
              });
            profileError = fallback.error;
          }

          if (profileError) {
            if (profileError.code === "23505") {
              throw new Error("Username is already taken.");
            }
            throw profileError;
          }

          // Show the recovery code modal to the newly registered user
          setNewlyCreatedRecoveryCode(generatedCode);
          return; // Modal will handle final reload on dismiss
        }

        window.location.reload();
      } else if (mode === "recover") {
        if (!recoveryCodeInput.trim()) {
          throw new Error("Please enter your recovery code.");
        }
        if (newPassword.length < 6) {
          throw new Error("New password must be at least 6 characters.");
        }
        if (newPassword !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        // Call the server recovery API
        const res = await fetch("/api/account/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleanUsername,
            recoveryCode: recoveryCodeInput.trim(),
            newPassword,
          }),
        });

        const result = await res.json();
        if (!res.ok || result.error) {
          throw new Error(result.error || "Failed to recover account.");
        }

        setSuccessMessage("Password reset successfully! Logging you in...");

        // Auto sign-in with the new password
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: newPassword,
        });

        if (signInErr) {
          // If auto sign-in has a minor delay, direct back to login form
          setTimeout(() => {
            handleSwitchMode("login");
          }, 1500);
        } else {
          setTimeout(() => {
            window.location.reload();
          }, 800);
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);

      let errorMessage = err.message || "An error occurred during authentication.";
      if (errorMessage.includes("@yapclub.local") || errorMessage.includes("@users.yapclub.com")) {
        errorMessage = "Invalid username format. Please use only letters and numbers.";
      } else if (errorMessage.toLowerCase().includes("invalid login credentials")) {
        errorMessage = "Incorrect username or password.";
      } else if (errorMessage.toLowerCase().includes("rate limit")) {
        errorMessage = "Too many attempts right now. Please wait a moment and try again.";
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-md bg-[#12131A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {mode === "login" && "Welcome Back"}
                      {mode === "signup" && "Join the Club"}
                      {mode === "recover" && "Recover Account"}
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                      {mode === "login" && "Log in to access your social features."}
                      {mode === "signup" && "Create an account to unlock profiles, following, and DMs."}
                      {mode === "recover" && "Enter your username & recovery code to set a new password."}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                      {error}
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  {/* Username Field */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={16} className="text-slate-500" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={20}
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                        className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                        placeholder="NeonFox42"
                      />
                    </div>
                  </div>

                  {/* Standard Password Field (for Login & Signup) */}
                  {mode !== "recover" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Password</label>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={() => handleSwitchMode("recover")}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock size={16} className="text-slate-500" />
                        </div>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  )}

                  {/* Account Recovery Fields */}
                  {mode === "recover" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-300">
                          Recovery Code
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <KeyRound size={16} className="text-amber-400" />
                          </div>
                          <input
                            type="text"
                            required
                            value={recoveryCodeInput}
                            onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-amber-500/30 rounded-xl text-amber-300 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all uppercase"
                            placeholder="YAP-XXXX-XXXX-XXXX"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Enter the code given to you when your account was created.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-300">
                          New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock size={16} className="text-slate-500" />
                          </div>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            placeholder="New password (min 6 chars)"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-300">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock size={16} className="text-slate-500" />
                          </div>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            placeholder="Re-enter new password"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-indigo-600/20"
                  >
                    {isLoading && <Loader2 size={16} className="animate-spin" />}
                    {mode === "login" && "Log In"}
                    {mode === "signup" && "Create Account"}
                    {mode === "recover" && "Reset Password & Log In"}
                  </button>
                </form>

                {/* Footer Switcher */}
                <div className="p-6 pt-0 text-center">
                  {mode === "recover" ? (
                    <button
                      type="button"
                      onClick={() => handleSwitchMode("login")}
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Log In</span>
                    </button>
                  ) : (
                    <p className="text-sm text-slate-400">
                      {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                      <button
                        type="button"
                        onClick={() => handleSwitchMode(mode === "login" ? "signup" : "login")}
                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                      >
                        {mode === "login" ? "Sign Up" : "Log In"}
                      </button>
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Post-Signup Recovery Code Modal */}
      {newlyCreatedRecoveryCode && (
        <RecoveryCodeModal
          isOpen={true}
          recoveryCode={newlyCreatedRecoveryCode}
          username={username}
          onClose={() => {
            setNewlyCreatedRecoveryCode(null);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
