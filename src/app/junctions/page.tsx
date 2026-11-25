"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useGuestUser } from "@/hooks/useGuestUser";
import { useUser } from "@/hooks/useUser";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";
import { Navbar } from "@/components/layout/Navbar";
import { JunctionCard } from "@/components/lobby/JunctionCard";
import { CreateJunctionModal } from "@/components/lobby/CreateJunctionModal";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { Junction } from "@/lib/types";
import { supabase } from "@/lib/supabase";
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
  MapPin,
  Compass,
  Shield,
  X,
  Flame,
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
  const { user } = useUser();
  const {
    guest,
    hasCompletedOnboarding,
    isLoaded,
  } = useGuestUser();
  const { activeJunctionId } = useActiveJunction();

  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [totalOnline, setTotalOnline] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");
  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(false);

  const userRef = useRef(user);
  const guestRef = useRef(guest);

  useEffect(() => {
    userRef.current = user;
    guestRef.current = guest;
  }, [user, guest]);

  // Hydrate cached lobby data cleanly on client mount without hydration mismatch
  useEffect(() => {
    try {
      const cachedJunctions = sessionStorage.getItem("yapclub_cached_junctions");
      if (cachedJunctions) {
        setJunctions(JSON.parse(cachedJunctions));
        setIsLoading(false);
      }
      const cachedOnline = sessionStorage.getItem("yapclub_cached_total_online");
      if (cachedOnline) {
        setTotalOnline(Number(cachedOnline));
      }
    } catch { }
  }, []);

  // If not onboarded, redirect to /
  useEffect(() => {
    if (isLoaded && !hasCompletedOnboarding) {
      router.push("/");
    }
  }, [isLoaded, hasCompletedOnboarding, router]);

  const fetchJunctions = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/junctions", { signal, cache: "no-store" });
      const data = await res.json();
      if (data.junctions) {
        setJunctions((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.junctions)) return prev;
          return data.junctions;
        });
        if (typeof data.totalOnline === "number") {
          setTotalOnline(data.totalOnline);
          try {
            sessionStorage.setItem("yapclub_cached_total_online", String(data.totalOnline));
          } catch { }
        }
        try {
          sessionStorage.setItem("yapclub_cached_junctions", JSON.stringify(data.junctions));
        } catch { }
      }
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name !== "AbortError") console.warn("Failed to fetch junctions:", e);
    }
  }, []);

  // Self-healing: if the user enters the lobby outside an active call, purge any orphaned ghost sessions
  useEffect(() => {
    if (!isLoaded) return;
    if (activeJunctionId) return;

    const myIdentities = [
      user?.id,
      user?.username,
      guest?.id,
      guest?.username,
    ].filter(Boolean) as string[];

    if (myIdentities.length === 0) return;

    fetch("/api/junctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "purge_user_ghosts",
        identities: myIdentities,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.purged) {
          fetchJunctions();
        }
      })
      .catch(() => {});
  }, [isLoaded, activeJunctionId, user?.id, user?.username, guest?.id, guest?.username, fetchJunctions]);

  useEffect(() => {
    let abortController: AbortController | null = null;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      await fetchJunctions(abortController.signal);
      setIsLoading(false);
      timeoutId = setTimeout(poll, 20000);
    };

    poll();

    // Instant local cleanup & fetch when user leaves a junction
    const handleJunctionLeft = (e: Event) => {
      const customEvent = e as CustomEvent<{ junctionId?: string }>;
      const leftId = customEvent.detail?.junctionId;
      if (leftId) {
        const currentUser = userRef.current;
        const currentGuest = guestRef.current;
        const myIds = new Set(
          [
            currentUser?.username,
            currentUser?.id,
            currentGuest?.id,
            currentGuest?.username,
          ]
            .filter(Boolean)
            .map((s) => (s as string).toLowerCase().trim())
        );

        setJunctions((prev) => {
          const updated = prev.map((j) => {
            if (j.id === leftId) {
              const remaining = (j.participants || []).filter((p) => {
                const pIdent = (p.identity || "").toLowerCase().trim();
                const pUser = (p.username || "").toLowerCase().trim();
                const pId = (p.id || "").toLowerCase().trim();
                return (
                  !myIds.has(pIdent) &&
                  !myIds.has(pUser) &&
                  !myIds.has(pId)
                );
              });
              return {
                ...j,
                participants: remaining,
                currentCount: remaining.length,
                moderatorIdentity: remaining.length === 0 ? "" : j.moderatorIdentity,
              };
            }
            return j;
          });
          try {
            sessionStorage.setItem("yapclub_cached_junctions", JSON.stringify(updated));
            const newTotal = updated.reduce((acc, it) => acc + (it.participants?.length || it.currentCount || 0), 0);
            sessionStorage.setItem("yapclub_cached_total_online", String(newTotal));
          } catch {}
          return updated;
        });
      }
      fetchJunctions();
    };
    window.addEventListener("yapclub_junction_left", handleJunctionLeft);

    // Debounced Realtime updates when users join/leave any room or rooms change
    let debounceTimer: NodeJS.Timeout | null = null;
    const triggerDebouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchJunctions();
      }, 1000);
    };

    // Instant global presence updates via WebSocket broadcast
    const globalPresenceChannel = supabase
      .channel("junctions_global_presence")
      .on("broadcast", { event: "presence_updated" }, (msg: any) => {
        const payload = msg?.payload;
        if (!payload) return;
        const { junctionId: updatedId, count: newCount, totalOnline: newTotal, participants: updatedParticipants } = payload;
        setJunctions((prev) => {
          const updated = prev.map((j) => {
            if (j.id === updatedId) {
              return {
                ...j,
                currentCount: newCount,
                participants: updatedParticipants !== undefined ? updatedParticipants : (newCount === 0 ? [] : j.participants),
              };
            }
            return j;
          });
          try {
            sessionStorage.setItem("yapclub_cached_junctions", JSON.stringify(updated));
          } catch {}
          return updated;
        });
        if (typeof newTotal === "number") {
          setTotalOnline(newTotal);
          try {
            sessionStorage.setItem("yapclub_cached_total_online", String(newTotal));
          } catch {}
        }
        triggerDebouncedFetch();
      })
      .subscribe();

    const channelId = `junctions_hub_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junction_participants" },
        () => {
          triggerDebouncedFetch();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junctions" },
        () => {
          triggerDebouncedFetch();
        }
      )
      .subscribe();

    const handleFocus = () => {
      triggerDebouncedFetch();
    };
    window.addEventListener("focus", handleFocus);

    const handleRoomUnlocked = () => {
      triggerDebouncedFetch();
    };
    window.addEventListener("yapclub_room_unlocked", handleRoomUnlocked);

    return () => {
      if (abortController) abortController.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("yapclub_junction_left", handleJunctionLeft);
      window.removeEventListener("yapclub_room_unlocked", handleRoomUnlocked);
      supabase.removeChannel(globalPresenceChannel);
      supabase.removeChannel(channel);
    };
  }, [fetchJunctions]);

  const handleManualRefresh = async () => {
    await fetchJunctions();
  };

  const handleJunctionCreated = (newJunction: Junction) => {
    setJunctions((prev) => [newJunction, ...prev.filter((j) => j.id !== newJunction.id)]);
  };

  const handleJunctionDeleted = (id: string) => {
    setJunctions((prev) => prev.filter((j) => j.id !== id));
  };

  const isPublicJunction = useCallback((j: Junction) => {
    if (j.isCustom || j.creatorId || (typeof j.id === "string" && j.id.startsWith("junc_"))) {
      return false;
    }
    return (typeof j.id === "string" && j.id.startsWith("station_")) || (Array.isArray(j.tags) && j.tags.includes("Public"));
  }, []);

  const isSuperAdmin = user?.role === "super_admin";

  const isRoomCreator = useCallback((j: Junction) => {
    const creatorIdentifier = (j.creatorId || j.moderatorIdentity || "").trim().toLowerCase();
    if (!creatorIdentifier) return false;
    const userAliases = [
      user?.username,
      user?.displayName,
      user?.name,
      user?.id,
      guest?.name,
      guest?.displayName,
      guest?.username,
      guest?.id,
    ]
      .filter(Boolean)
      .map((a) => a!.trim().toLowerCase());
    return userAliases.includes(creatorIdentifier);
  }, [user?.username, user?.displayName, user?.name, user?.id, guest?.name, guest?.displayName, guest?.username, guest?.id]);

  const { publicStations, userRooms, currentTabRooms, activeInTabCount } = useMemo(() => {
    const now = Date.now();
    const query = searchQuery.trim().toLowerCase();

    const filtered = junctions
      .filter((j) => {
        const matchesCategory =
          activeTab === "private"
            ? selectedCategory === "all" || j.category === selectedCategory
            : selectedCategory === "all" || (Array.isArray(j.tags) && j.tags.includes(selectedCategory));

        if (!matchesCategory) return false;

        if (showActiveOnly) {
          const count = typeof j.currentCount === "number" ? j.currentCount : (j.participants?.length || 0);
          if (count === 0) return false;
        }

        if (!query) return true;

        return (
          (j.name || "").toLowerCase().includes(query) ||
          (j.description || "").toLowerCase().includes(query) ||
          (Array.isArray(j.tags) && j.tags.some((t) => t.toLowerCase().includes(query)))
        );
      })
      .sort((a, b) => {
        if (activeTab === "private") {
          const aMine = isRoomCreator(a);
          const bMine = isRoomCreator(b);
          if (aMine && !bMine) return -1;
          if (!aMine && bMine) return 1;
        }
        return (b.participants?.length ?? b.currentCount) - (a.participants?.length ?? a.currentCount);
      });

    const pub = filtered.filter(isPublicJunction);
    const priv = filtered.filter((j) => {
      if (isPublicJunction(j)) return false;
      if (j.expiresAt && j.expiresAt <= now) return false;
      if (j.isLocked) {
        return isRoomCreator(j) || isSuperAdmin;
      }
      return true;
    });

    const current = activeTab === "public" ? pub : priv;
    const activeCount = current.filter(
      (j) => (typeof j.currentCount === "number" ? j.currentCount : (j.participants?.length || 0)) > 0
    ).length;

    return {
      publicStations: pub,
      userRooms: priv,
      currentTabRooms: current,
      activeInTabCount: activeCount,
    };
  }, [junctions, activeTab, selectedCategory, searchQuery, showActiveOnly, isPublicJunction, isRoomCreator, isSuperAdmin]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedCategory !== "all" || showActiveOnly);
  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setShowActiveOnly(false);
  };

  if (!isLoaded || !guest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-slate-400">
        <div className="h-12 w-auto flex items-center justify-center animate-pulse mb-3">
          <Image
            src="/webIcon.png"
            alt="YapClub"
            width={40}
            height={40}
            className="h-10 w-auto object-contain filter drop-shadow-[0_4px_16px_rgba(99,102,241,0.4)]"
            priority
          />
        </div>
        <p className="text-xs font-medium tracking-wide text-slate-400">Loading YapClub...</p>
      </div>
    );
  }

  return (
    <>
      <PullToRefresh onRefresh={handleManualRefresh}>
        <div className="min-h-screen flex flex-col text-slate-200">
          <Navbar totalOnline={totalOnline} />

          <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-6">
            {/* Platform Suspension Banner */}
            {user?.isBanned && (
              <div className="mb-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                  <Shield size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-rose-200">Account Suspended</h4>
                  <p className="text-xs text-rose-300/90 font-light mt-0.5">
                    {user.bannedReason || "Your account has been suspended by YapClub moderation. You cannot join voice rooms or create new rooms."}
                  </p>
                </div>
              </div>
            )}

            {/* Sleek Top Header & Action Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-light text-white tracking-tight">
                    Live <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-200">Rooms</span>
                  </h1>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.05] text-slate-300 font-medium border border-white/[0.08] tabular-nums">
                    {currentTabRooms.length} <span className="hidden sm:inline">Rooms</span>
                  </span>
                  {activeInTabCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowActiveOnly((prev) => !prev)}
                      className={`hidden xs:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full font-medium border transition-colors cursor-pointer ${
                        showActiveOnly
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300/90 hover:bg-emerald-500/15"
                      }`}
                      title="Filter to rooms with active speakers"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="tabular-nums">{activeInTabCount} Active</span>
                    </button>
                  )}
                </div>

                {/* Mobile Tab Switcher */}
                <div className="flex sm:hidden bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 ml-2">
                  <button
                    onClick={() => {
                      setActiveTab("public");
                      setSelectedCategory("all");
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${activeTab === "public" ? "bg-white/12 text-white shadow-sm" : "text-slate-400"
                      }`}
                  >
                    Public
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("private");
                      setSelectedCategory("all");
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${activeTab === "private" ? "bg-white/12 text-white shadow-sm" : "text-slate-400"
                      }`}
                  >
                    Private
                  </button>
                </div>
              </div>

              <div className="hidden sm:flex sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                <div className="flex bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 mr-0 sm:mr-2">
                  <button
                    onClick={() => {
                      setActiveTab("public");
                      setSelectedCategory("all");
                    }}
                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${activeTab === "public" ? "bg-white/12 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    Public <span className="text-slate-400 text-xs tabular-nums">({publicStations.length})</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("private");
                      setSelectedCategory("all");
                    }}
                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${activeTab === "private" ? "bg-white/12 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    Private <span className="text-slate-400 text-xs tabular-nums">({userRooms.length})</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (user?.isBanned) return;
                    setIsCreateModalOpen(true);
                  }}
                  disabled={user?.isBanned}
                  className={`w-full sm:w-auto px-4 py-2 rounded-xl text-white font-semibold text-[13px] shadow-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${user?.isBanned
                      ? "bg-rose-500/10 border border-rose-500/20 text-rose-400 cursor-not-allowed opacity-60"
                      : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 cursor-pointer active:scale-95"
                    }`}
                >
                  <Plus size={16} />
                  <span>Create Room</span>
                </button>
              </div>
            </div>

            {/* Search & Filters (Lightweight Surfaces for Smooth Scrolling) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4 sm:mb-6">
              {/* Search Box */}
              <div className="relative flex-1 sm:max-w-xs lg:max-w-sm">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rooms, cities, or tags..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#12141E] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-[#151824] transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Quick Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setShowActiveOnly((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors border cursor-pointer active:scale-95 ${
                    showActiveOnly
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-sm"
                      : "bg-[#12141E] text-slate-400 border-white/[0.06] hover:text-slate-200 hover:border-white/15"
                  }`}
                >
                  <Flame size={12} className={showActiveOnly ? "text-emerald-400" : "text-slate-500"} />
                  <span>Live Now</span>
                </button>

                {(activeTab === "public" ? PUBLIC_FILTERS : CATEGORY_FILTERS).map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors border cursor-pointer active:scale-95 ${isSelected
                          ? "bg-indigo-500/15 text-white border-indigo-500/35 shadow-sm"
                          : "bg-[#12141E] text-slate-400 border-white/[0.06] hover:text-slate-200 hover:border-white/15"
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
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-[148px] rounded-2xl bg-[#11131B] border border-white/[0.06] animate-pulse p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-24 rounded-md bg-white/[0.05]" />
                      <div className="h-5 w-12 rounded-full bg-white/[0.05]" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-3/5 rounded bg-white/[0.06]" />
                      <div className="h-3 w-4/5 rounded bg-white/[0.04]" />
                    </div>
                    <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between">
                      <div className="h-4 w-20 rounded bg-white/[0.04]" />
                      <div className="h-7 w-16 rounded-lg bg-white/[0.06]" />
                    </div>
                  </div>
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
                  <div className="p-8 sm:p-12 rounded-[2rem] bg-[#12141E] border border-white/[0.07] text-center max-w-md mx-auto shadow-2xl">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                      <Radio className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-medium text-white mb-2">
                      {hasActiveFilters ? "No Matching Stations" : "No Public Stations"}
                    </h3>
                    <p className="text-sm text-slate-400 font-light mb-5">
                      {hasActiveFilters
                        ? "Try clearing your search or filter selection."
                        : "Public stations will appear here."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    )}
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
                  <div className="p-8 sm:p-12 rounded-[2rem] bg-[#12141E] border border-white/[0.07] text-center max-w-md mx-auto shadow-2xl">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                      <Radio className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-medium text-white mb-2">
                      {hasActiveFilters ? "No Matching Rooms" : "No Private Rooms"}
                    </h3>
                    <p className="text-sm text-slate-400 mb-6 font-light">
                      {hasActiveFilters
                        ? "Try adjusting your filters or start a new custom room."
                        : "Start a custom voice room."}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                      <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Plus size={15} />
                        <span>Create Room</span>
                      </button>
                    </div>
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
      {activeTab === "private" && !user?.isBanned && (
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
