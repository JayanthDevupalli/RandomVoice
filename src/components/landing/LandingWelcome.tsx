"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  ArrowRight,
  ShieldCheck,
  Check,
  Volume2
} from "lucide-react";
import { AVAILABLE_AVATARS } from "../ui/UserAvatar";
import { useGuestUser } from "@/hooks/useGuestUser";
import { COLOR_PALETTES, generateRandomNickname } from "@/lib/guest-utils";
import confetti from "canvas-confetti";

export function LandingWelcome() {
  const router = useRouter();
  const { guest, completeOnboarding, isLoaded } = useGuestUser();

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

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#0B0C10] text-slate-200 selection:bg-indigo-500/30 selection:text-white overflow-x-hidden font-sans">

      {/* Background Glows - Subtle and Modern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-20%] sm:top-[-20%] sm:left-[-10%] w-[80%] h-[60%] sm:w-[60%] sm:h-[60%] bg-indigo-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-20%] sm:bottom-[-20%] sm:right-[-10%] w-[70%] h-[50%] sm:w-[50%] sm:h-[50%] bg-purple-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Top Nav */}
      <header className="relative z-40 w-full pt-6 sm:pt-8">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5 opacity-90 hover:opacity-100 transition-opacity">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" strokeWidth={1.5} />
            <span className="font-semibold text-base sm:text-lg tracking-wide text-white">
              yap<span className="text-slate-400 font-normal">club</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] sm:text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              Live Rooms
            </span>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 flex-1 w-full max-w-[90rem] mx-auto px-4 sm:px-12 py-8 lg:py-20 flex flex-col justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-20">

          {/* Left Column: Hero Text */}
          <div className="w-full lg:w-[45%] space-y-6 sm:space-y-8 text-left mt-4 sm:mt-0">
            <h1 className="text-[2.5rem] leading-[1.1] sm:text-6xl lg:text-[4.5rem] xl:text-[5rem] font-light text-white tracking-tight">
              Conversations, <br />
              <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">flowing freely.</span>
            </h1>

            <p className="text-sm sm:text-lg xl:text-xl text-slate-400 leading-relaxed max-w-lg font-light">
              Join exclusive 7-seat anonymous voice spaces. Discuss ideas, play games, or just listen. Zero friction.
            </p>

            <div className="flex flex-wrap gap-4 sm:gap-6 pt-2 sm:pt-4 text-xs sm:text-sm text-slate-500 font-light">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <ShieldCheck size={16} className="text-indigo-400/70 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                <span>No accounts required</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Volume2 size={16} className="text-indigo-400/70 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                <span>Crystal clear audio</span>
              </div>
            </div>
          </div>

          {/* Right Column: Wider & Shorter Join Form */}
          <div className="w-full lg:w-[55%] max-w-2xl mx-auto lg:mx-0 relative" id="join-form">
            {/* Subtle glow behind the form */}
            <div className="absolute inset-0 bg-indigo-500/5 blur-xl sm:blur-2xl rounded-[1.5rem] sm:rounded-[2rem] -z-10" />

            <div className="p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] bg-[#12131A]/80 border border-white/5 backdrop-blur-xl shadow-2xl shadow-black/50">

              <div className="mb-5 sm:mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-medium text-white tracking-wide">
                    Enter a room
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-light">Set your temporary persona.</p>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                  <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400/80" />
                </div>
              </div>

              <div className="space-y-5 sm:space-y-6">
                {/* Nickname Input */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                    <label className="text-[11px] sm:text-xs font-medium text-slate-400">Display Name</label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                        <button
                          onClick={() => { setGender('male'); setName(generateRandomNickname('male')); }}
                          className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-medium transition-colors ${gender === 'male' ? 'bg-indigo-500/30 text-indigo-300' : 'text-slate-400 hover:bg-white/10'}`}
                        >
                          Male
                        </button>
                        <button
                          onClick={() => { setGender('female'); setName(generateRandomNickname('female')); }}
                          className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-medium transition-colors border-l border-white/10 ${gender === 'female' ? 'bg-pink-500/30 text-pink-300' : 'text-slate-400 hover:bg-white/10'}`}
                        >
                          Female
                        </button>
                        <button
                          onClick={() => { setGender('any'); setName(generateRandomNickname('any')); }}
                          className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-medium transition-colors border-l border-white/10 ${gender === 'any' ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:bg-white/10'}`}
                        >
                          Any
                        </button>
                      </div>
                      <button
                        onClick={() => setName(generateRandomNickname(gender))}
                        className="text-[10px] sm:text-[11px] text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors font-medium ml-1"
                      >
                        Roll
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. LunarEcho"
                    maxLength={20}
                    className="w-full px-4 py-2.5 sm:py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all text-sm sm:text-base font-light"
                  />
                </div>

                {/* Avatar and Color Selectors side-by-side on tablet/desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  {/* Vector Avatar Selector */}
                  <div>
                    <label className="block text-[11px] sm:text-xs font-medium text-slate-400 mb-2">Avatar</label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_AVATARS.map((p) => {
                        const Icon = p.icon;
                        const isSelected = selectedAvatar === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedAvatar(p.id)}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all flex items-center justify-center cursor-pointer ${isSelected
                                ? "bg-white/10 text-white shadow-sm ring-1 ring-white/20"
                                : "bg-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
                              }`}
                            title={p.label}
                          >
                            <Icon size={16} className="sm:w-[18px] sm:h-[18px]" strokeWidth={isSelected ? 2 : 1.5} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Aura Palette Selector */}
                  <div>
                    <label className="block text-[11px] sm:text-xs font-medium text-slate-400 mb-2">Aura Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTES.map((c) => {
                        const isSelected = selectedColor === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-all cursor-pointer ${isSelected
                                ? "ring-2 ring-offset-2 ring-offset-[#12131A] ring-white/40 scale-110 shadow-lg"
                                : "opacity-40 hover:opacity-100"
                              }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Checkboxes & CTA */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 pt-4 border-t border-white/5">
                  <div className="space-y-3 flex-1 w-full">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className={`mt-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm border flex items-center justify-center transition-colors shrink-0 ${isAdult ? 'bg-indigo-500 border-indigo-500' : 'bg-transparent border-white/20 group-hover:border-white/40'}`}>
                        {isAdult && <Check size={10} className="text-white sm:w-3 sm:h-3" strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={isAdult}
                        onChange={(e) => setIsAdult(e.target.checked)}
                        className="hidden"
                      />
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-light group-hover:text-slate-200 transition-colors">I am 18 years of age or older.</span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className={`mt-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm border flex items-center justify-center transition-colors shrink-0 ${agreedToTerms ? 'bg-indigo-500 border-indigo-500' : 'bg-transparent border-white/20 group-hover:border-white/40'}`}>
                        {agreedToTerms && <Check size={10} className="text-white sm:w-3 sm:h-3" strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="hidden"
                      />
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-light group-hover:text-slate-200 transition-colors">
                        I accept the <Link href="/guidelines" className="text-indigo-400 hover:text-indigo-300">Guidelines</Link>.
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!name.trim() || !isAdult || !agreedToTerms}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-white text-[#0B0C10] hover:bg-slate-200 font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <span>Continue</span>
                    <ArrowRight size={16} strokeWidth={2} />
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 sm:py-6 text-center text-[10px] sm:text-xs font-light text-slate-600 relative z-10">
        <p>yapclub © 2024</p>
      </footer>
    </div>
  );
}
