"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuestUser, Junction } from "@/lib/types";
import { X, Plus, Sparkles, Gamepad2, Cpu, Coffee, Music, Languages, Dices, Loader2 } from "lucide-react";

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
  const [tagsInput, setTagsInput] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<number>(8);
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

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter((t) => t.length > 0);

    try {
      const res = await fetch("/api/junctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || `Welcome to ${name.trim()} voice room!`,
          category,
          tags: tags.length > 0 ? tags : ["Custom", category],
          maxParticipants,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg p-5 sm:p-6 rounded-2xl bg-card border border-slate-300 dark:border-slate-700/80 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 dark:text-slate-400 hover:text-white rounded-lg hover:bg-slate-200 dark:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 shrink-0">
            <Plus size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight mb-0.5">Create Custom Junction</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">Launch an instant voice room for your topic</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Junction Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Indie Music Showcase or Lethal Company Night"
              maxLength={45}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium border text-left transition-all ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700 hover:text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <Icon size={15} className={isSelected ? "text-indigo-400" : "text-slate-500 dark:text-slate-400"} />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are we talking about?"
              rows={2}
              maxLength={140}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. Chill, English, LoFi, Anime"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Max Participants
            </label>
            <div className="flex gap-2">
              {[2, 4, 6, 8].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setMaxParticipants(size)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    maxParticipants === size
                      ? "bg-indigo-600/20 border-indigo-500 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-700 hover:text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-800 font-medium text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
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
