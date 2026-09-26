"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, User, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // The Fake Email Trick for pure Username/Password auth
    // Using a valid .com TLD so Supabase's regex doesn't reject it
    const fakeEmail = `${username.toLowerCase()}@users.yapclub.com`;

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password,
        });
        if (error) throw error;
      } else {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email: fakeEmail,
          password,
        });
        
        if (signUpError) throw signUpError;
        
        // After signup, we also need to create their Profile row
        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              username,
              avatar: "zap", // default
            });
            
          if (profileError) {
            // Check for unique constraint violation
            if (profileError.code === "23505") {
              throw new Error("Username is already taken.");
            }
            throw profileError;
          }
        }
      }
      
      // Success! Refresh the page to apply auth state
      window.location.reload();
      
    } catch (err: any) {
      console.error("Auth error:", err);
      
      // Sanitize error messages to never leak the fake email trick to the user
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

  return createPortal(
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
                  {isLogin ? "Welcome Back" : "Join the Club"}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {isLogin 
                    ? "Log in to access your social features." 
                    : "Create an account to unlock profiles, following, and DMs."}
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
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    placeholder="NeonFox42"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Password</label>
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                {isLogin ? "Log In" : "Create Account"}
              </button>
            </form>

            {/* Footer */}
            <div className="p-6 pt-0 text-center">
              <p className="text-sm text-slate-400">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  {isLogin ? "Sign Up" : "Log In"}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
