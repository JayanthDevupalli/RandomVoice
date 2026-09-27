"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  ArrowRight,
  ShieldCheck,
  Check,
  Volume2,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  LogIn,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { AVAILABLE_AVATARS } from "../ui/UserAvatar";
import { useGuestUser } from "@/hooks/useGuestUser";
import { COLOR_PALETTES, generateRandomNickname } from "@/lib/guest-utils";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import { useLiveStats } from "@/hooks/useLiveStats";
import { generateRecoveryCode } from "@/lib/recovery-utils";
import { RecoveryCodeModal } from "@/components/auth/RecoveryCodeModal";

interface LandingWelcomeProps {
  initialMode?: "guest" | "login";
}

export function LandingWelcome({ initialMode = "guest" }: LandingWelcomeProps) {
  const router = useRouter();
  const { guest, completeOnboarding, isLoaded } = useGuestUser();
  const { totalOnline, activeRooms, totalRooms } = useLiveStats();

  // Mode: "guest" (Instant persona) or "login" (Member auth)
  const [authMode, setAuthMode] = useState<"guest" | "login">(initialMode);

  // Member Auth State
  const [isSignup, setIsSignup] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Recovery State
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [newlyCreatedRecoveryCode, setNewlyCreatedRecoveryCode] = useState<string | null>(null);
  const [savedUserForRecoveryModal, setSavedUserForRecoveryModal] = useState<string>("");

  // Guest State
  const [gender, setGender] = useState<'any' | 'male' | 'female'>('any');
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("zap");
  const [selectedColor, setSelectedColor] = useState("#818CF8"); // Softer default indigo
  const [isAdult, setIsAdult] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (isLoaded && guest && !hasInitialized.current) {
      hasInitialized.current = true;
      setName(guest.name || "");
      setSelectedAvatar(guest.avatar || "zap");
      setSelectedColor(guest.color || "#818CF8");
    }
  }, [guest, isLoaded]);

  // Guest Join Handler
  const handleJoin = () => {
    if (!name.trim() || !isAdult || !agreedToTerms) return;

    confetti({
      particleCount: 50,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#818cf8', '#a78bfa'],
      disableForReducedMotion: true
    });

    completeOnboarding({
      name: name.trim() || guest?.name || "Guest",
      avatar: selectedAvatar,
      color: selectedColor,
    });

    router.push("/junctions");
  };

  // Member Login / Signup Handler
  const handleMemberAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setAuthError("Please fill in both username and password.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);

    const cleanUsername = loginUsername.trim();
    const fakeEmail = `${cleanUsername.toLowerCase()}@users.yapclub.com`;

    try {
      if (!isSignup) {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: loginPassword,
        });
        if (error) throw error;

        // Fetch user's profile
        let userAvatar = "zap";
        if (data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .single();
          if (profile?.avatar) {
            userAvatar = profile.avatar;
          }
        }

        confetti({
          particleCount: 50,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#ffffff', '#818cf8', '#a78bfa'],
          disableForReducedMotion: true
        });

        completeOnboarding({
          name: cleanUsername,
          avatar: userAvatar,
          color: "#6366F1",
        });

        // Use direct navigation to apply active session state cleanly
        window.location.href = "/junctions";
      } else {
        // Sign Up
        const { error: signUpError, data } = await supabase.auth.signUp({
          email: fakeEmail,
          password: loginPassword,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          const generatedCode = generateRecoveryCode();

          let { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              username: cleanUsername,
              avatar: selectedAvatar || "zap",
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
                avatar: selectedAvatar || "zap",
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

          confetti({
            particleCount: 60,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#ffffff', '#818cf8', '#ec4899'],
            disableForReducedMotion: true
          });

          // Store code to trigger the recovery code modal before finalizing onboarding
          setSavedUserForRecoveryModal(cleanUsername);
          setNewlyCreatedRecoveryCode(generatedCode);
          return;
        }

        completeOnboarding({
          name: cleanUsername,
          avatar: selectedAvatar || "zap",
          color: "#6366F1",
        });

        window.location.href = "/junctions";
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let errorMessage = err.message || "An error occurred during authentication.";

      if (errorMessage.includes("@yapclub.local") || errorMessage.includes("@users.yapclub.com")) {
        errorMessage = "Invalid username format. Please use only letters, numbers, and underscores.";
      } else if (errorMessage.toLowerCase().includes("invalid login credentials")) {
        errorMessage = "Incorrect username or password.";
      } else if (errorMessage.toLowerCase().includes("rate limit")) {
        errorMessage = "Too many attempts right now. Please wait a moment and try again.";
      }

      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // Account Recovery Handler
  const handleAccountRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !recoveryCodeInput.trim() || !recoveryNewPassword) {
      setAuthError("Please fill in all recovery fields.");
      return;
    }
    if (recoveryNewPassword.length < 6) {
      setAuthError("New password must be at least 6 characters.");
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setRecoverySuccess(null);

    const cleanUsername = loginUsername.trim();
    const fakeEmail = `${cleanUsername.toLowerCase()}@users.yapclub.com`;

    try {
      const res = await fetch("/api/account/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          recoveryCode: recoveryCodeInput.trim(),
          newPassword: recoveryNewPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || "Failed to recover account.");
      }

      setRecoverySuccess("Password reset successfully! Logging you in...");

      // Automatically sign in with new password
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: recoveryNewPassword,
      });

      if (signInErr) {
        setTimeout(() => {
          setIsRecovering(false);
          setAuthError(null);
        }, 1500);
      } else {
        let userAvatar = "zap";
        if (data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .single();
          if (profile?.avatar) {
            userAvatar = profile.avatar;
          }
        }

        confetti({
          particleCount: 50,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#ffffff', '#818cf8', '#a78bfa'],
          disableForReducedMotion: true
        });

        completeOnboarding({
          name: cleanUsername,
          avatar: userAvatar,
          color: "#6366F1",
        });

        setTimeout(() => {
          window.location.href = "/junctions";
        }, 600);
      }
    } catch (err: any) {
      console.error("Recovery error:", err);
      setAuthError(err.message || "Failed to recover account.");
    } finally {
      setAuthLoading(false);
    }
  };

  const scrollToForm = () => {
    document.getElementById("welcome-card")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#0B0C10] text-slate-200 selection:bg-indigo-500/30 selection:text-white overflow-x-hidden font-sans">

      {/* Background Glows - Subtle and Modern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-20%] sm:top-[-20%] sm:left-[-10%] w-[80%] h-[60%] sm:w-[60%] sm:h-[60%] bg-indigo-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-20%] sm:bottom-[-20%] sm:right-[-10%] w-[70%] h-[50%] sm:w-[50%] sm:h-[50%] bg-purple-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Top Nav */}
      <header className="relative z-40 w-full pt-4 sm:pt-7">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5 opacity-90 hover:opacity-100 transition-opacity">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" strokeWidth={1.5} />
            <span className="font-semibold text-base sm:text-lg tracking-wide text-white">
              yap<span className="text-slate-400 font-normal">club</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs font-medium">
            <span className="hidden xs:flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              <span className="font-semibold text-white tracking-tight">{totalOnline}</span>
              <span className="text-slate-400">Live</span>
              <span className="text-white/20">•</span>
              <span className="text-slate-400">{activeRooms > 0 ? `${activeRooms} active` : `${totalRooms || 26} rooms`}</span>
            </span>

            {/* Quick Header Toggle Button */}
            <button
              onClick={() => {
                setAuthMode(authMode === "login" ? "guest" : "login");
                setAuthError(null);
                scrollToForm();
              }}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              {authMode === "login" ? (
                <>
                  <Radio size={13} className="text-indigo-400" />
                  <span>Guest Mode</span>
                </>
              ) : (
                <>
                  <Lock size={13} className="text-indigo-400" />
                  <span>Log In</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 flex-1 w-full max-w-[90rem] mx-auto px-4 sm:px-12 py-5 sm:py-8 lg:py-16 flex flex-col justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-10 lg:gap-16">

          {/* Left Column: Hero Text */}
          <div className="w-full lg:w-[45%] space-y-4 sm:space-y-6 text-center lg:text-left mt-2 sm:mt-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] sm:text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{totalOnline > 0 ? `${totalOnline} users chatting live now` : "Realtime Social Audio Rooms"}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-[4.2rem] xl:text-[4.8rem] font-light text-white tracking-tight leading-[1.12]">
              Conversations, <br />
              <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
                flowing freely.
              </span>
            </h1>

            <p className="text-xs sm:text-base xl:text-lg text-slate-400 leading-relaxed max-w-lg mx-auto lg:mx-0 font-light">
              Join exclusive 7-seat anonymous voice spaces. Discuss ideas, play games, or whisper with friends. Instant access or member profiles.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-6 pt-1 sm:pt-2 text-xs text-slate-400 font-light">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-indigo-400" strokeWidth={1.8} />
                <span>Zero signup required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Volume2 size={15} className="text-indigo-400" strokeWidth={1.8} />
                <span>Crystal clear 3D audio</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Card (Guest & Login) */}
          <div className="w-full lg:w-[55%] max-w-xl mx-auto lg:mx-0 relative" id="welcome-card">
            {/* Ambient card glow */}
            <div className="absolute inset-0 bg-indigo-500/10 blur-xl sm:blur-2xl rounded-[1.5rem] sm:rounded-[2rem] -z-10" />

            <div className="p-4 sm:p-7 rounded-[1.5rem] sm:rounded-[2rem] bg-[#12131A]/90 border border-white/10 backdrop-blur-2xl shadow-2xl shadow-black/80">

              {/* Mode Segmented Tab Switcher */}
              <div className="grid grid-cols-2 p-1 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl mb-5 sm:mb-6">
                <button
                  type="button"
                  onClick={() => { setAuthMode('guest'); setAuthError(null); }}
                  className={`py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                    authMode === 'guest'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio size={14} className={authMode === 'guest' ? 'text-white' : 'text-slate-400'} />
                  <span>Instant Guest</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(null); }}
                  className={`py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Lock size={14} className={authMode === 'login' ? 'text-white' : 'text-slate-400'} />
                  <span>Member Login</span>
                </button>
              </div>

              {/* ========================================================= */}
              {/* TAB 1: INSTANT GUEST ONBOARDING                           */}
              {/* ========================================================= */}
              {authMode === "guest" && (
                <div className="space-y-4 sm:space-y-5 animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div>
                      <h2 className="text-base sm:text-lg font-medium text-white tracking-wide">
                        Enter a Voice Room
                      </h2>
                      <p className="text-xs text-slate-400 font-light">Set your temporary persona & join immediately.</p>
                    </div>
                    <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-indigo-400 shrink-0">
                      <Radio className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Nickname Input & Generator */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1.5 gap-1.5">
                      <label className="text-[11px] sm:text-xs font-medium text-slate-300">Display Name</label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="flex items-center bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => { setGender('male'); setName(generateRandomNickname('male')); }}
                            className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-medium transition-colors ${gender === 'male' ? 'bg-indigo-500/40 text-indigo-200' : 'text-slate-400 hover:bg-white/10'}`}
                          >
                            Male
                          </button>
                          <button
                            type="button"
                            onClick={() => { setGender('female'); setName(generateRandomNickname('female')); }}
                            className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-medium transition-colors border-l border-white/10 ${gender === 'female' ? 'bg-pink-500/40 text-pink-200' : 'text-slate-400 hover:bg-white/10'}`}
                          >
                            Female
                          </button>
                          <button
                            type="button"
                            onClick={() => { setGender('any'); setName(generateRandomNickname('any')); }}
                            className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-medium transition-colors border-l border-white/10 ${gender === 'any' ? 'bg-emerald-500/40 text-emerald-200' : 'text-slate-400 hover:bg-white/10'}`}
                          >
                            Any
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setName(generateRandomNickname(gender))}
                          className="text-[10px] sm:text-[11px] text-indigo-400 hover:text-indigo-300 uppercase tracking-wider transition-colors font-semibold px-1 py-0.5"
                        >
                          Roll
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. LunarEcho"
                      maxLength={20}
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-white/[0.06] transition-all text-base font-normal"
                    />
                  </div>

                  {/* Avatar & Color Picker */}
                  <div className="space-y-3.5">
                    {/* Avatars */}
                    <div>
                      <label className="block text-[11px] sm:text-xs font-medium text-slate-300 mb-1.5">Avatar</label>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2">
                        {AVAILABLE_AVATARS.map((p) => {
                          const Icon = p.icon;
                          const isSelected = selectedAvatar === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedAvatar(p.id)}
                              className={`aspect-square rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40 ring-1 ring-white/30 scale-105"
                                  : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                              }`}
                              title={p.label}
                            >
                              <Icon size={16} strokeWidth={isSelected ? 2.2 : 1.6} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Aura Color */}
                    <div>
                      <label className="block text-[11px] sm:text-xs font-medium text-slate-300 mb-1.5">Aura Color</label>
                      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                        {COLOR_PALETTES.map((c) => {
                          const isSelected = selectedColor === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setSelectedColor(c)}
                              style={{ backgroundColor: c }}
                              className={`w-6 h-6 sm:w-6 sm:h-6 rounded-full transition-all cursor-pointer ${
                                isSelected
                                  ? "ring-2 ring-offset-2 ring-offset-[#12131A] ring-white scale-110 shadow-lg"
                                  : "opacity-40 hover:opacity-100"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Terms & Age Verification */}
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="flex items-start gap-2.5 cursor-pointer group select-none min-h-[32px]">
                      <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${isAdult ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-transparent border-white/20 group-hover:border-white/40'}`}>
                        {isAdult && <Check size={11} strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={isAdult}
                        onChange={(e) => setIsAdult(e.target.checked)}
                        className="hidden"
                      />
                      <span className="text-[11px] sm:text-xs text-slate-400 font-light group-hover:text-slate-200 transition-colors">
                        I am 18 years of age or older.
                      </span>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer group select-none min-h-[32px]">
                      <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${agreedToTerms ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-transparent border-white/20 group-hover:border-white/40'}`}>
                        {agreedToTerms && <Check size={11} strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="hidden"
                      />
                      <span className="text-[11px] sm:text-xs text-slate-400 font-light group-hover:text-slate-200 transition-colors">
                        I accept the <Link href="/guidelines" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Guidelines & Code of Conduct</Link>.
                      </span>
                    </label>
                  </div>

                  {/* Continue Button */}
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!name.trim() || !isAdult || !agreedToTerms}
                    className="w-full py-3.5 sm:py-4 rounded-xl bg-white text-[#0B0C10] hover:bg-slate-200 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg cursor-pointer active:scale-[0.99]"
                  >
                    <span>Enter Yap Rooms</span>
                    <ArrowRight size={16} strokeWidth={2.2} />
                  </button>

                  {/* Switch to Login Link */}
                  <div className="pt-2 text-center border-t border-white/5">
                    <p className="text-xs text-slate-400 font-light">
                      Already have a YapClub account?{" "}
                      <button
                        type="button"
                        onClick={() => { setAuthMode("login"); setAuthError(null); }}
                        className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 cursor-pointer"
                      >
                        Log In here
                      </button>
                    </p>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 2: MEMBER LOGIN & REGISTRATION / RECOVERY             */}
              {/* ========================================================= */}
              {authMode === "login" && (
                isRecovering ? (
                  <form onSubmit={handleAccountRecovery} className="space-y-4 sm:space-y-5 animate-fadeIn">
                    {/* Top Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/5">
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                          <KeyRound size={18} className="text-amber-400" />
                          Account Recovery
                        </h2>
                        <p className="text-xs text-slate-400 font-light mt-0.5">
                          Reset your password using your secret recovery code.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsRecovering(false);
                          setAuthError(null);
                          setRecoverySuccess(null);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <ArrowLeft size={14} />
                        <span>Back</span>
                      </button>
                    </div>

                    {/* Auth Error Banner */}
                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-2 animate-fadeIn">
                        <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    {/* Success Banner */}
                    {recoverySuccess && (
                      <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-start gap-2 animate-fadeIn">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{recoverySuccess}</span>
                      </div>
                    )}

                    {/* Username Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Username</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <User size={16} />
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={20}
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                          className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base font-normal transition-all"
                          placeholder="Your username"
                        />
                      </div>
                    </div>

                    {/* Recovery Code Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Secret Recovery Code</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <KeyRound size={16} className="text-amber-400" />
                        </div>
                        <input
                          type="text"
                          required
                          value={recoveryCodeInput}
                          onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                          className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-amber-500/30 rounded-xl text-amber-300 font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base font-normal transition-all uppercase"
                          placeholder="YAP-XXXX-XXXX-XXXX"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">The recovery code given when your account was created.</p>
                    </div>

                    {/* New Password Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">New Password</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={recoveryNewPassword}
                          onChange={(e) => setRecoveryNewPassword(e.target.value)}
                          className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base font-normal transition-all"
                          placeholder="Minimum 6 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Confirm New Password</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={recoveryConfirmPassword}
                          onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base font-normal transition-all"
                          placeholder="Re-type new password"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={authLoading || !loginUsername.trim() || !recoveryCodeInput.trim() || recoveryNewPassword.length < 6}
                      className="w-full py-3.5 sm:py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-[0.99] mt-2"
                    >
                      {authLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <KeyRound size={16} />
                      )}
                      <span>Reset Password & Enter</span>
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecovering(false);
                          setAuthError(null);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      >
                        ← Back to Member Login
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleMemberAuth} className="space-y-4 sm:space-y-5 animate-fadeIn">
                    {/* Top Header & Sub-Toggle */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/5">
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-white">
                          {isSignup ? "Create Member Account" : "Member Login"}
                        </h2>
                        <p className="text-xs text-slate-400 font-light mt-0.5">
                          {isSignup 
                            ? "Unlock persistent profiles, followers, and DMs." 
                            : "Log in to access your direct messages and profile."}
                        </p>
                      </div>

                      <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setIsSignup(false); setAuthError(null); }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            !isSignup ? "bg-white text-black shadow-sm" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Log In
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsSignup(true); setAuthError(null); }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            isSignup ? "bg-white text-black shadow-sm" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Sign Up
                        </button>
                      </div>
                    </div>

                    {/* Auth Error Banner */}
                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-2 animate-fadeIn">
                        <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    {/* Username Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Username</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <User size={16} />
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={20}
                          autoComplete="username"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                          className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base font-normal transition-all"
                          placeholder="e.g. CyberViper"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">Only letters, numbers, and underscores.</p>
                    </div>

                    {/* Password Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-300">Password</label>
                        {!isSignup && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsRecovering(true);
                              setAuthError(null);
                              setRecoverySuccess(null);
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Lock size={16} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          autoComplete={isSignup ? "new-password" : "current-password"}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-base font-normal transition-all"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">Minimum 6 characters.</p>
                    </div>

                    {/* Perks for Sign Up */}
                    {isSignup && (
                      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1 text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
                          <Check size={12} className="text-indigo-400" />
                          <span>Direct Messaging & Secret Whispers</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Check size={12} className="text-emerald-400" />
                          <span>Custom user profiles, bios, and follower network</span>
                        </div>
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={authLoading || !loginUsername.trim() || loginPassword.length < 6}
                      className="w-full py-3.5 sm:py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-[0.99] mt-2"
                    >
                      {authLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <LogIn size={16} />
                      )}
                      <span>{isSignup ? "Create Free Account" : "Log In to YapClub"}</span>
                    </button>

                    {/* Switch between Sign Up / Log In & Guest */}
                    <div className="pt-2 text-center space-y-2 border-t border-white/5">
                      <p className="text-xs text-slate-400">
                        {isSignup ? "Already have an account?" : "Don't have an account yet?"}{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setIsSignup(!isSignup);
                            setAuthError(null);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 cursor-pointer"
                        >
                          {isSignup ? "Log In" : "Sign Up"}
                        </button>
                      </p>

                      <button
                        type="button"
                        onClick={() => { setAuthMode("guest"); setAuthError(null); }}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                      >
                        ← Or enter as an Instant Guest without an account
                      </button>
                    </div>
                  </form>
                )
              )}

            </div>
          </div>
        </div>
      </main>

      {/* Post-Signup Recovery Code Modal */}
      {newlyCreatedRecoveryCode && (
        <RecoveryCodeModal
          isOpen={true}
          recoveryCode={newlyCreatedRecoveryCode}
          username={savedUserForRecoveryModal}
          onClose={() => {
            setNewlyCreatedRecoveryCode(null);
            completeOnboarding({
              name: savedUserForRecoveryModal,
              avatar: selectedAvatar || "zap",
              color: "#6366F1",
            });
            window.location.href = "/junctions";
          }}
        />
      )}

      {/* Footer */}
      <footer className="w-full py-4 sm:py-6 text-center text-[10px] sm:text-xs font-light text-slate-600 relative z-10">
        <p>yapclub © {new Date().getFullYear()} • Anonymous & Member Social Audio</p>
      </footer>
    </div>
  );
}
