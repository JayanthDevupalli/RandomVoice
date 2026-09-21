"use client";

import { useState, useEffect } from "react";
import { GuestUser } from "@/lib/types";
import { COLOR_PALETTES, generateRandomNickname } from "@/lib/guest-utils";
import { AVAILABLE_AVATARS, UserAvatar } from "@/components/ui/UserAvatar";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import confetti from "canvas-confetti";
import {
  X,
  Dices,
  Check,
  Sparkles,
  Mic,
  ArrowRight,
  ShieldCheck,
  Radio
} from "lucide-react";

interface PersonaSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  guest: GuestUser | null;
  onComplete: (persona: Partial<GuestUser>) => void;
}

export function PersonaSetupModal({
  isOpen,
  onClose,
  guest,
  onComplete,
}: PersonaSetupModalProps) {
  const [name, setName] = useState(guest?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(guest?.avatar || "zap");
  const [selectedColor, setSelectedColor] = useState(guest?.color || "#6366F1");
  const [step, setStep] = useState<1 | 2>(1);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  // Audio test meter
  const { volume, isSpeaking } = useAudioVisualizer(mediaStream, isOpen && step === 2);

  useEffect(() => {
    if (guest && !name) {
      setName(guest.name);
      setSelectedAvatar(guest.avatar || "zap");
      setSelectedColor(guest.color || "#6366F1");
    }
  }, [guest, name]);

  const handleProceedToMicCheck = async () => {
    if (!name.trim()) return;
    setStep(2);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setMediaStream(stream);
      setHasMicPermission(true);
    } catch (e) {
      setHasMicPermission(false);
    }
  };

  const handleFinish = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.6 },
    });

    onComplete({
      name: name.trim() || guest?.name || "CosmicGuest",
      avatar: selectedAvatar,
      color: selectedColor,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg p-5 sm:p-8 rounded-3xl bg-card border border-slate-300 dark:border-slate-700/80 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-500 dark:text-slate-400 hover:text-white rounded-xl hover:bg-slate-200 dark:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Step {step} of 2
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Zero-Friction Pass</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {step === 1 ? "Create Anonymous Persona" : "Microphone Sound Check"}
            </h2>
          </div>
        </div>

        {step === 1 ? (
          /* STEP 1: Persona Customization */
          <div className="space-y-6">
            {/* Live Persona Card Preview */}
            <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4">
              <UserAvatar avatar={selectedAvatar} color={selectedColor} size="lg" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Your Voice Handle
                </span>
                <div className="text-base font-bold text-white truncate">
                  {name || "Choose a nickname"}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400 font-medium">
                  <ShieldCheck size={13} />
                  <span>100% Anonymous • 7-Seat Pass</span>
                </div>
              </div>
            </div>

            {/* Nickname Input & Randomize */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Your Nickname
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. NeonFalcon, CyberOtter"
                  maxLength={20}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setName(generateRandomNickname())}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all"
                  title="Roll random handle"
                >
                  <Dices size={16} />
                  <span>Roll</span>
                </button>
              </div>
            </div>

            {/* Vector Avatar Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Choose Vector Icon Avatar
              </label>
              <div className="grid grid-cols-6 gap-2">
                {AVAILABLE_AVATARS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = selectedAvatar === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedAvatar(p.id)}
                      className={`p-3 rounded-xl transition-all flex flex-col items-center justify-center border ${
                        isSelected
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                          : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-white"
                      }`}
                      title={p.label}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aura Palette Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Accent Glow Aura
              </label>
              <div className="flex gap-2.5">
                {COLOR_PALETTES.map((c) => {
                  const isSelected = selectedColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                        isSelected
                          ? "scale-125 ring-2 ring-white shadow-lg"
                          : "hover:scale-110 opacity-80"
                      }`}
                    >
                      {isSelected && <Check size={14} className="text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 1 CTA */}
            <button
              type="button"
              onClick={handleProceedToMicCheck}
              disabled={!name.trim()}
              className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md shadow-indigo-600/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Next: Sound Check</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          /* STEP 2: Mic Sound Check */
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3">
                <Mic size={28} className={isSpeaking ? "text-emerald-400 animate-bounce" : ""} />
              </div>

              <h3 className="text-base font-bold text-white mb-1">
                {hasMicPermission === false ? "Microphone Permission Blocked" : "Test Your Voice"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-4">
                {hasMicPermission === false
                  ? "Please enable microphone permission in your browser to speak in voice rooms."
                  : "Say something out loud to test your audio visualizer level."}
              </p>

              {/* Solid Level Meter */}
              <div className="w-full max-w-xs mx-auto h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative mb-2">
                <div
                  className="h-full bg-emerald-500 transition-all duration-75 rounded-full"
                  style={{ width: `${Math.min(100, volume * 1.4)}%` }}
                />
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-semibold">
                {isSpeaking ? (
                  <span className="text-emerald-400 animate-pulse">Speaking Detected</span>
                ) : (
                  <span className="text-slate-500">Listening...</span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-3 px-5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-800 font-semibold text-xs transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md shadow-indigo-600/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles size={16} className="text-indigo-200" />
                <span>Enter Voice Junctions</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
