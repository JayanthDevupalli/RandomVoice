"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGuestUser } from "@/hooks/useGuestUser";
import { Navbar } from "@/components/layout/Navbar";
import { JunctionCard } from "@/components/lobby/JunctionCard";
import { CreateJunctionModal } from "@/components/lobby/CreateJunctionModal";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { Junction } from "@/lib/types";
import {
  Plus,
  Sparkles,
  Search,
  Radio,
  Dices,
  Cpu,
  Gamepad2,
  Coffee,
  Music,
  Languages,
  Mic,
  MapPin,
  Compass
} from "lucide-react";

const PUBLIC_FILTERS = [
  { id: "all", label: "All Regions", icon: Radio },
  { id: "South", label: "South", icon: MapPin },
  { id: "North", label: "North", icon: MapPin },
  { id: "East", label: "East", icon: MapPin },
  { id: "West", label: "West", icon: MapPin },
  { id: "Central", label: "Central", icon: Compass },
];

const CATEGORY_FILTERS = [
  { id: "all", label: "All Junctions", icon: Radio },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "tech", label: "Tech & AI", icon: Cpu },
  { id: "chill", label: "Late Night Chill", icon: Coffee },
  { id: "music", label: "Music & Beats", icon: Music },
  { id: "philosophy", label: "Deep Talks", icon: Sparkles },
  { id: "languages", label: "Languages", icon: Languages },
  { id: "casual", label: "Roulette", icon: Dices },
];

export default function JunctionsPage() {
  const router = useRouter();
  const {
    guest,
    hasCompletedOnboarding,
    isLoaded,
    updateGuest,
    clearProfile,
  } = useGuestUser();

  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [totalOnline, setTotalOnline] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");

  // If not onboarded, redirect to /
  useEffect(() => {
    if (isLoaded && !hasCompletedOnboarding) {
      router.push("/");
    }
  }, [isLoaded, hasCompletedOnboarding, router]);

  const fetchJunctions = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/junctions", { signal });
      const data = await res.json();
      if (data.junctions) {
        setJunctions((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.junctions)) return prev;
          return data.junctions;
        });
        setTotalOnline((prev) => data.totalOnline || prev);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") console.warn("Failed to fetch junctions:", e);
    }
  };

  useEffect(() => {
    let abortController: AbortController | null = null;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();
      
      await fetchJunctions(abortController.signal);
      setIsLoading(false);
      timeoutId = setTimeout(poll, 15000);
    };

    poll();

    return () => {
      if (abortController) abortController.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  const handleManualRefresh = async () => {
    await fetchJunctions();
  };

  const handleJunctionCreated = (newJunction: Junction) => {
    setJunctions((prev) => [newJunction, ...prev.filter((j) => j.id !== newJunction.id)]);
  };

  const handleJunctionDeleted = (id: string) => {
    setJunctions((prev) => prev.filter((j) => j.id !== id));
  };

  const filteredJunctions = junctions
    .filter((j) => {
      const matchesCategory =
        activeTab === "private"
          ? selectedCategory === "all" || j.category === selectedCategory
          : selectedCategory === "all" || j.tags.includes(selectedCategory); // public filters match region tag
          
      const matchesSearch =
        j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => b.currentCount - a.currentCount);

  const publicStations = filteredJunctions.filter((j) => !j.isCustom);
  const userRooms = filteredJunctions.filter((j) => j.isCustom && !j.isLocked);

  if (!isLoaded || !guest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-slate-400">
        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse mb-3 shadow-md">
          <Radio className="w-5 h-5 text-indigo-400" />
        </div>
        <p className="text-xs font-medium">Loading YapClub...</p>
      </div>
    );
  }

  return (
    <>
      <PullToRefresh onRefresh={handleManualRefresh}>
      <div className="min-h-screen flex flex-col text-slate-200">
        <Navbar guest={guest} onUpdateGuest={updateGuest} onClearProfile={clearProfile} totalOnline={totalOnline} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-6">
        {/* Sleek Top Header & Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 sm:mb-5">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-light text-white tracking-tight">
                Live <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">Rooms</span>
              </h1>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-slate-300 font-medium border border-white/10 backdrop-blur-md">
                {filteredJunctions.length} <span className="hidden sm:inline">Active</span>
              </span>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="flex sm:hidden bg-white/5 border border-white/10 rounded-xl p-1 ml-2">
              <button
                onClick={() => {
                  setActiveTab("public");
                  setSelectedCategory("all");
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === "public" ? "bg-white/10 text-white shadow-sm" : "text-slate-400"
                }`}
              >
                Public
              </button>
              <button
                onClick={() => {
                  setActiveTab("private");
                  setSelectedCategory("all");
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === "private" ? "bg-white/10 text-white shadow-sm" : "text-slate-400"
                }`}
              >
                Private
              </button>
            </div>
          </div>

          <div className="hidden sm:flex sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 mr-0 sm:mr-4">
              <button
                onClick={() => {
                  setActiveTab("public");
                  setSelectedCategory("all");
                }}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                  activeTab === "public" ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Public
              </button>
              <button
                onClick={() => {
                  setActiveTab("private");
                  setSelectedCategory("all");
                }}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                  activeTab === "private" ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Private
              </button>
            </div>
            
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[13px] shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <Plus size={16} />
              <span>Create Room</span>
            </button>
          </div>
        </div>

        {/* Minimal Search & Filters (Single Row on Desktop / Compact on Mobile) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 sm:mb-5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms or tags..."
              className="w-full pl-9 pr-3.5 py-1.5 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07] backdrop-blur-md transition-all font-light"
            />
          </div>

          {/* Quick Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {(activeTab === "public" ? PUBLIC_FILTERS : CATEGORY_FILTERS).map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all border cursor-pointer backdrop-blur-md active:scale-95 ${
                    isSelected
                      ? "bg-white/10 text-white border-white/20 shadow-sm"
                      : "bg-white/5 text-slate-400 border-white/5 hover:text-slate-200 hover:bg-white/10 hover:border-white/10"
                  }`}
                >
                  <Icon size={12} className={isSelected ? "text-indigo-400" : "text-slate-500"} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tab Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 sm:h-48 rounded-[1.5rem] bg-[#12131A]/40 border border-white/5 animate-pulse p-4" />
            ))}
          </div>
        ) : activeTab === "public" ? (
          <div>
            {publicStations.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {publicStations.map((junction) => (
                  <JunctionCard key={junction.id} junction={junction} onDelete={handleJunctionDeleted} />
                ))}
              </div>
            ) : (
              <div className="p-8 sm:p-12 rounded-[2rem] bg-[#12131A]/60 backdrop-blur-xl border border-white/5 text-center max-w-md mx-auto shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                  <Radio className="w-6 h-6" />
                </div>
                <h3 className="text-lg sm:text-xl font-medium text-white mb-2">No Public Stations</h3>
                <p className="text-sm text-slate-400 font-light">
                  Public stations will appear here.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {userRooms.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {userRooms.map((junction) => (
                  <JunctionCard key={junction.id} junction={junction} onDelete={handleJunctionDeleted} />
                ))}
              </div>
            ) : (
              <div className="p-8 sm:p-12 rounded-[2rem] bg-[#12131A]/60 backdrop-blur-xl border border-white/5 text-center max-w-md mx-auto shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                  <Radio className="w-6 h-6" />
                </div>
                <h3 className="text-lg sm:text-xl font-medium text-white mb-2">No Private Rooms</h3>
                <p className="text-sm text-slate-400 mb-6 font-light">
                  Start a custom voice room.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer active:scale-95"
                >
                  <Plus size={15} />
                  <span>Create Room</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightweight Footer */}
      <footer className="w-full border-t border-white/5 py-4 text-center text-[10px] sm:text-xs font-light text-slate-500 bg-background/50 backdrop-blur-md">
        <p>YapClub • Proudly Made in India 🇮🇳 • Pure Voice, Zero Lag</p>
      </footer>

      </div>
    </PullToRefresh>

    {/* Mobile FAB for Create Room */}
    {activeTab === "private" && (
      <button
        onClick={() => setIsCreateModalOpen(true)}
        className="sm:hidden fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>
    )}

    {/* Create Junction Modal */}
    <CreateJunctionModal
      isOpen={isCreateModalOpen}
      onClose={() => setIsCreateModalOpen(false)}
      guest={guest}
      onCreated={handleJunctionCreated}
    />
    </>
  );
}
