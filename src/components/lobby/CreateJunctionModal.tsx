"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuestUser, Junction } from "@/lib/types";
import { X, Plus, Sparkles, Gamepad2, Cpu, Coffee, Music, Languages, Dices, Loader2, Users } from "lucide-react";

interface CreateJunctionModalProps {
  isOpen: boolean;
  onClose: () => void;
  guest: GuestUser | null;
  onCreated?: (junction: Junction) => void;
}

const CATEGORIES: { id: Junction["category"]; label: string; icon: any }[] = [
  { id: "casual", label: "Casual Hangout", icon: Dices },
  { id: "gaming", label: "Gaming & Squads", icon: Gamepad2 },
  { id: "tech", label: "Tech & AI", icon: Cpu },
  { id: "chill", label: "Late Night Chill", icon: Coffee },
  { id: "music", label: "Music & Beats", icon: Music },
  { id: "philosophy", label: "Deep Talks", icon: Sparkles },
  { id: "languages", label: "Language Practice", icon: Languages },
];

export function CreateJunctionModal({ isOpen, onClose, guest, onCreated }: CreateJunctionModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Junction["category"]>("casual");
  const [maxParticipants, setMaxParticipants] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a junction title");
      return;
    }
    if (!guest) {
      setError("Guest session loading...");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/junctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || `Welcome to ${name.trim()} voice room!`,
          category,
          tags: ["Custom", category],
          maxParticipants: maxParticipants || 7,
          isLocked: false,
          creator: {
            name: guest.name,
            avatar: guest.avatar || "zap",
            color: guest.color,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create junction");
      }

      if (onCreated && data.junction) {
        onCreated(data.junction);
      }

      onClose();
      router.push(`/junction/${data.junction.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg p-6 pb-10 sm:p-8 rounded-t-[2rem] sm:rounded-[2rem] bg-[#12131A] border-t sm:border border-white/10 shadow-2xl text-slate-100 max-h-[95vh] overflow-y-auto no-scrollbar animate-slideUp sm:animate-fadeIn">
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-2 text-slate-500 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6 pr-8">
          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.4)] text-white shrink-0">
            <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-tight mb-0.5">Create Junction</h2>
            <p className="text-[10px] sm:text-sm text-slate-400 font-light">Launch an instant voice room for your topic</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Junction Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Indie Music Showcase"
              maxLength={45}
              required
              className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07] focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-light shadow-inner"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 mt-2">
              Select Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-medium border transition-all duration-300 cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-100 shadow-[0_0_15px_rgba(79,70,229,0.15)]"
                        : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSelected ? "text-indigo-400" : "text-slate-500"}`} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 mt-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are we talking about?"
              rows={2}
              maxLength={140}
              className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07] focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-light resize-none shadow-inner"
            />
          </div>

          {/* Max Capacity Selector */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 mt-4 sm:mt-5">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Users size={12} className="text-indigo-400" />
                <span>Max Room Capacity</span>
              </label>
              <span className="text-xs font-semibold text-indigo-300">
                {maxParticipants} seats
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[2, 4, 6, 7, 8].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setMaxParticipants(size)}
                  className={`py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    maxParticipants === size
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 ring-1 ring-white/20 scale-[1.02]"
                      : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{size}</span>
                  <span className="text-[9px] font-normal opacity-70">seats</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white font-medium text-sm transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Creating Room...</span>
                </>
              ) : (
                <span>Launch Room</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
