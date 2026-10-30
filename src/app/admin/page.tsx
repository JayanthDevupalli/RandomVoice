"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser, UserRole } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Crown,
  Ban,
  Trash2,
  Lock,
  Unlock,
  Radio,
  Users,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Info,
  Edit3,
  Wrench,
  Power,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  X,
  Flag,
} from "lucide-react";
import Link from "next/link";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";

interface AdminUserRecord {
  id: string;
  username: string;
  displayName?: string;
  avatar: string;
  bio?: string;
  card_bg_color?: string;
  role: UserRole;
  is_banned: boolean;
  banned_reason?: string;
  created_at?: string;
}

interface AdminRoomRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  isCustom?: boolean;
  isLocked?: boolean;
  creatorId?: string;
  currentCount: number;
  maxParticipants: number;
  participants: Array<{
    identity: string;
    name: string;
    avatar: string;
    role: string;
    reportedBy?: string[];
  }>;
  createdAt: number;
  bannedIdentities?: string[];
}

export default function AdminPortalPage() {
  const router = useRouter();
  const { user, isLoaded, isRegistered } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<"users" | "rooms" | "desk" | "stats">("users");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole | "banned">("all");
  const [roomFilter, setRoomFilter] = useState<"all" | "locked" | "public">("all");
  const [deskSubFilter, setDeskSubFilter] = useState<"all" | "platform" | "rooms" | "reports">("all");
  const [deskSearch, setDeskSearch] = useState("");

  // Confirmation Modals
  const [pendingAction, setPendingAction] = useState<{
    type: "role_change" | "toggle_ban" | "delete_user" | "delete_room";
    targetId: string;
    targetName: string;
    newRole?: UserRole;
    newBanState?: boolean;
  } | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [banReasonInput, setBanReasonInput] = useState("Violation of community guidelines");

  // Display Name Edit Modal
  const [pendingNameEdit, setPendingNameEdit] = useState<{
    targetId: string;
    targetUsername: string;
    currentDisplayName: string;
  } | null>(null);
  const [newDisplayNameInput, setNewDisplayNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Determine permissions - strictly require registered authenticated user with verified role
  const isMainAdmin = Boolean(isRegistered && user && user.role === "super_admin");
  const isStaffAdmin = Boolean(isRegistered && user && user.role === "admin");
  const isManager = Boolean(isRegistered && user && user.role === "manager");
  const hasAdminAccess = isMainAdmin || isStaffAdmin || isManager;

  // Platform suspension clearance: Admins and Main Admin only. Managers cannot suspend platform accounts.
  const canSuspendPlatformUser = (target: AdminUserRecord) => {
    if (target.role === "super_admin") return false;
    if (target.role === "admin") return isMainAdmin;
    return isMainAdmin || isStaffAdmin;
  };

  // Maintenance Mode hook & local state
  const {
    isMaintenance,
    maintenanceData,
    isUpdating: isMaintenanceUpdating,
    toggleMaintenance,
  } = useMaintenanceMode();

  const [maintenanceMessageInput, setMaintenanceMessageInput] = useState("");
  const [maintenanceTitleInput, setMaintenanceTitleInput] = useState("");
  const [isEditingMaintenanceMsg, setIsEditingMaintenanceMsg] = useState(false);
  const [showMaintenancePreview, setShowMaintenancePreview] = useState(false);

  useEffect(() => {
    if (maintenanceData) {
      setMaintenanceMessageInput(maintenanceData.message || "");
      setMaintenanceTitleInput(maintenanceData.title || "");
    }
  }, [maintenanceData]);

  const handleToggleMaintenance = async (nextState: boolean) => {
    if (!isMainAdmin) {
      showToast("error", "Only Main Admin (jayanthadmin) has clearance to toggle maintenance mode.");
      return;
    }

    const res = await toggleMaintenance(nextState, maintenanceMessageInput, maintenanceTitleInput);
    if (res.success) {
      showToast(
        "success",
        nextState
          ? "⚠️ Platform Maintenance Mode ACTIVATED across the entire website!"
          : "✅ Maintenance Mode turned OFF. Normal platform operations restored."
      );
    } else {
      showToast("error", res.error || "Failed to toggle maintenance mode");
    }
  };

  const handleSaveMaintenanceAnnouncement = async () => {
    if (!isMainAdmin) {
      showToast("error", "Only Main Admin can update announcements.");
      return;
    }
    const res = await toggleMaintenance(isMaintenance, maintenanceMessageInput, maintenanceTitleInput);
    if (res.success) {
      showToast("success", "Maintenance announcement updated!");
      setIsEditingMaintenanceMsg(false);
    } else {
      showToast("error", res.error || "Failed to update announcement");
    }
  };

  const handleResetMaintenanceDefault = () => {
    setMaintenanceTitleInput("Maintenance in Progress");
    setMaintenanceMessageInput("Platform updates in progress. Voice rooms & features remain active!");
  };

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(user?.name ? { "x-requester-username": user.name } : {}),
      ...(user?.username ? { "x-requester-username": user.username } : {}),
      ...(user?.role ? { "x-requester-role": user.role } : {}),
    };
  };

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const headers = await getAuthHeaders();
      const [usersRes, roomsRes] = await Promise.all([
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/rooms", { headers }),
      ]);

      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users || []);
      }
      if (roomsRes.ok) {
        const rData = await roomsRes.json();
        setRooms(rData.rooms || []);
      }
    } catch (e) {
      console.error("Failed to load admin data:", e);
      showToast("error", "Failed to fetch platform data");
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!user || !isRegistered || !hasAdminAccess) {
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id, hasAdminAccess, isRegistered]);

  // Handle Role Change
  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (newRole === "admin" && !isMainAdmin) {
      showToast("error", "Only Main Admin (jayanthadmin) can appoint Admins.");
      return;
    }

    setPendingAction(null);

    const prevUsers = [...users];
    setUsers((prev) =>
      prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
    );
    showToast("success", `Role updated to ${newRole}`);

    try {
      setIsSubmittingAction(true);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          targetUserId,
          action: "set_role",
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }
    } catch (err: any) {
      setUsers(prevUsers);
      showToast("error", err.message || "Failed to update role");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Ban / Unban
  const handleToggleBan = async (targetUserId: string, shouldBan: boolean, reason?: string) => {
    setPendingAction(null);

    const prevUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUserId
          ? { ...u, is_banned: shouldBan, banned_reason: shouldBan ? reason : undefined }
          : u
      )
    );
    showToast("success", shouldBan ? "User account suspended" : "User suspension lifted");

    try {
      setIsSubmittingAction(true);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          targetUserId,
          action: "toggle_ban",
          isBanned: shouldBan,
          bannedReason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to toggle ban status");
      }
    } catch (err: any) {
      setUsers(prevUsers);
      showToast("error", err.message || "Failed to update ban status");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Display Name Update
  const handleUpdateDisplayName = async (targetUserId: string, newDisplayName: string) => {
    const trimmed = newDisplayName.trim();
    if (!trimmed) {
      showToast("error", "Display name cannot be empty");
      return;
    }

    setPendingNameEdit(null);

    const prevUsers = [...users];
    setUsers((prev) =>
      prev.map((u) => (u.id === targetUserId ? { ...u, displayName: trimmed } : u))
    );
    showToast("success", `Shown name updated to "${trimmed}"`);

    try {
      setIsSubmittingAction(true);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          targetUserId,
          action: "update_display_name",
          displayName: trimmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update shown name");
      }
    } catch (err: any) {
      setUsers(prevUsers);
      showToast("error", err.message || "Failed to update shown name");
    } finally {
      setIsSavingName(false);
    }
  };

  // Handle User Account Deletion
  const handleDeleteUser = async (targetUserId: string) => {
    setIsSubmittingAction(true);
    try {
      setIsSubmittingAction(true);
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/users?targetUserId=${encodeURIComponent(targetUserId)}`,
        { method: "DELETE", headers }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      showToast("success", data.message || "User account deleted");
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      setPendingAction(null);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Room Deletion
  const handleDeleteRoom = async (junctionId: string) => {
    setIsSubmittingAction(true);
    try {
      setIsSubmittingAction(true);
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/rooms?junctionId=${encodeURIComponent(junctionId)}`,
        { method: "DELETE", headers }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to terminate room");
      }

      showToast("success", "Room terminated successfully");
      setRooms((prev) => prev.filter((r) => r.id !== junctionId));
      setPendingAction(null);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Room-Level Unban
  const handleRoomUnban = async (roomId: string, targetIdentity: string) => {
    try {
      const res = await fetch(`/api/junctions/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "moderate",
          modAction: "unban",
          targetIdentity,
          moderatorIdentity: user?.username || user?.name || "admin",
          moderatorUserId: user?.id,
          requesterRole: user?.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to unban from room");
      }
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? {
                ...r,
                bannedIdentities: (r.bannedIdentities || []).filter(
                  (b) => (b || "").trim().toLowerCase() !== targetIdentity.trim().toLowerCase()
                ),
              }
            : r
        )
      );
      showToast("success", `Unbanned @${targetIdentity} from room`);
    } catch (err: any) {
      showToast("error", err.message || "Failed to unban from room");
    }
  };

  // Moderation Desk: Platform Banned Users
  const platformBannedUsers = useMemo(() => {
    return users.filter((u) => u.is_banned);
  }, [users]);

  // Moderation Desk: Room-level bans across all junctions
  const roomBans = useMemo(() => {
    const list: Array<{ roomId: string; roomName: string; roomCategory: string; bannedIdentity: string }> = [];
    rooms.forEach((r) => {
      (r.bannedIdentities || []).forEach((b) => {
        if (b) {
          list.push({
            roomId: r.id,
            roomName: r.name,
            roomCategory: r.category,
            bannedIdentity: b,
          });
        }
      });
    });
    return list;
  }, [rooms]);

  // Moderation Desk: Reported active participants
  const reportedParticipants = useMemo(() => {
    const list: Array<{
      roomId: string;
      roomName: string;
      identity: string;
      name: string;
      avatar: string;
      reportedBy: string[];
    }> = [];
    rooms.forEach((r) => {
      (r.participants || []).forEach((p) => {
        if (p.reportedBy && p.reportedBy.length > 0) {
          list.push({
            roomId: r.id,
            roomName: r.name,
            identity: p.identity,
            name: p.name,
            avatar: p.avatar,
            reportedBy: p.reportedBy,
          });
        }
      });
    });
    return list;
  }, [rooms]);

  const totalDeskCount = platformBannedUsers.length + roomBans.length + reportedParticipants.length;

  // Filtered Users
  const filteredUsers = useMemo(() => {
    const q = (userSearch || "").toLowerCase();
    return users.filter((u) => {
      const uName = (u.username || "").toLowerCase();
      const uDisplay = (u.displayName || "").toLowerCase();
      const uBio = (u.bio || "").toLowerCase();
      const uId = (u.id || "").toLowerCase();

      const matchesSearch =
        !q ||
        uName.includes(q) ||
        uDisplay.includes(q) ||
        uBio.includes(q) ||
        uId.includes(q);

      if (!matchesSearch) return false;

      if (roleFilter === "all") return true;
      if (roleFilter === "banned") return Boolean(u.is_banned);
      return u.role === roleFilter;
    });
  }, [users, userSearch, roleFilter]);

  // Filtered Rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomFilter === "locked") return r.isLocked;
      if (roomFilter === "public") return !r.isLocked;
      return true;
    });
  }, [rooms, roomFilter]);

  // Stats
  const totalUsersCount = users.length;
  const adminCount = users.filter((u) => u.role === "admin" || u.role === "super_admin").length;
  const managerCount = users.filter((u) => u.role === "manager").length;
  const bannedCount = users.filter((u) => u.is_banned).length;
  const lockedRoomsCount = rooms.filter((r) => r.isLocked).length;

  // Loading screen while verifying auth & mounting
  if (!mounted || !isLoaded) {
    return (
      <div className="min-h-screen bg-[#0A0B10] text-slate-100 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <RefreshCw size={22} className="animate-spin" />
            </div>
            <p className="text-xs text-slate-400 font-medium">Verifying Administrator Clearance...</p>
          </div>
        </main>
      </div>
    );
  }

  // Access denied screen
  if (!user || !isRegistered || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-[#0A0B10] text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#12131A] border border-rose-500/20 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <ShieldAlert size={32} />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Access Restricted</h1>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              This area is strictly reserved for YapClub Main Administrators and staff. You do not possess
              administrative clearance.
            </p>
            <button
              onClick={() => router.push("/junctions")}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Return to Voice Hangouts
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 sm:px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl text-xs sm:text-sm font-semibold animate-in slide-in-from-bottom-5 duration-300 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/90 border-rose-500/40 text-rose-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        
        {/* UNIFIED EXECUTIVE COMMAND HUB (HERO + MAINTENANCE TOGGLE + QUICK METRICS) */}
        <section className="relative rounded-3xl bg-gradient-to-br from-[#12131F] via-[#10111A] to-[#14121F] border border-white/10 p-5 sm:p-7 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            
            {/* Header Top Row: Badges, Title & Refresh Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck size={13} />
                    Executive Console
                  </span>

                  {isMainAdmin ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                      <Crown size={13} className="text-amber-400" />
                      Founder: @jayanthadmin
                    </span>
                  ) : isStaffAdmin ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center gap-1.5">
                      <Shield size={13} />
                      Administrator
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
                      <Sparkles size={13} />
                      Community Manager
                    </span>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Control & Moderation Console
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                  {isMainAdmin ? (
                    <>
                      Platform root control active. You can manage roles, terminate hangouts, moderate users, and toggle platform maintenance.
                    </>
                  ) : isStaffAdmin ? (
                    <>
                      Administrator mode. Moderate users, terminate public & private rooms, and appoint managers.
                    </>
                  ) : (
                    <>
                      Manager mode. Oversee deck stages, ban or unban disruptive participants from rooms, and review the Moderation Desk.
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <button
                  onClick={fetchData}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw size={13} className={isRefreshing ? "animate-spin text-indigo-400" : ""} />
                  <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                </button>
              </div>
            </div>

            {/* INTEGRATED SYSTEM MAINTENANCE SWITCH BAR */}
            <div
              className={`rounded-2xl p-4 border transition-all ${
                isMaintenance
                  ? "bg-amber-950/20 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                  : "bg-black/30 border-white/5"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                      isMaintenance
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-white/5 text-slate-400 border border-white/10"
                    }`}
                  >
                    <Wrench size={16} className={isMaintenance ? "animate-bounce" : ""} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-white">
                        Platform Maintenance Notice
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                          isMaintenance
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {isMaintenance ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            Live Alert Active
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Normal Operations
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate max-w-xl mt-0.5">
                      {isMaintenance
                        ? `Live notice: "${maintenanceData.message}"`
                        : "When turned on, a slim top notice informs visitors without blocking site access."}
                    </p>
                  </div>
                </div>

                {/* Right: Switch & Edit Button */}
                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {isMainAdmin ? (
                    <>
                      <button
                        onClick={() => setIsEditingMaintenanceMsg(!isEditingMaintenanceMsg)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                        title="Customize Notice Text"
                      >
                        <Edit3 size={13} className="text-amber-400" />
                        <span className="text-[11px] hidden sm:inline">Customize</span>
                        {isEditingMaintenanceMsg ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-2.5 py-1 rounded-xl">
                        <span className="text-[11px] font-bold text-slate-300">
                          {isMaintenance ? "Active" : "Off"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isMaintenance}
                          disabled={isMaintenanceUpdating}
                          onClick={() => handleToggleMaintenance(!isMaintenance)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                            isMaintenance
                              ? "bg-amber-600 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                              : "bg-slate-800 border-white/10"
                          }`}
                          title="Toggle Maintenance Mode"
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              isMaintenance ? "translate-x-5 text-amber-600" : "translate-x-0 text-slate-500"
                            }`}
                          >
                            <Power size={10} className={isMaintenance ? "text-amber-600 font-bold" : "text-slate-500"} />
                          </span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-500 italic bg-white/5 px-2 py-1 rounded-lg">
                      Super Admin Only
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable Custom Message Drawer */}
              {isMainAdmin && isEditingMaintenanceMsg && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-3 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Maintenance Notice Text (compact one-liner recommended):
                    </label>
                    <input
                      type="text"
                      value={maintenanceMessageInput}
                      onChange={(e) => setMaintenanceMessageInput(e.target.value)}
                      placeholder="e.g. Platform updates in progress. Voice rooms & features remain active!"
                      maxLength={120}
                      className="w-full px-3 py-1.5 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleResetMaintenanceDefault}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      Reset Default
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMaintenancePreview(!showMaintenancePreview)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 cursor-pointer flex items-center gap-1"
                      >
                        {showMaintenancePreview ? <EyeOff size={11} /> : <Eye size={11} />}
                        <span>{showMaintenancePreview ? "Hide Preview" : "Preview"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isMaintenanceUpdating}
                        onClick={handleSaveMaintenanceAnnouncement}
                        className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isMaintenanceUpdating ? "Saving..." : "Save Text"}
                      </button>
                    </div>
                  </div>

                  {showMaintenancePreview && (
                    <div className="rounded-xl border border-amber-500/30 bg-[#161008] p-2 text-amber-100 flex items-center gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                        Maintenance
                      </span>
                      <span className="text-[11px] text-amber-200 truncate">
                        {maintenanceMessageInput || "Platform updates in progress. Voice rooms & features remain active!"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Metrics Bar: 4 Clean Stat Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 pt-2">
              <div className="bg-black/30 border border-white/5 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                  <Users size={13} className="text-indigo-400" />
                  <span>Total Members</span>
                </div>
                <div className="text-lg sm:text-2xl font-bold text-white">{totalUsersCount}</div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                  <Radio size={13} className="text-emerald-400" />
                  <span>Active Rooms</span>
                </div>
                <div className="text-lg sm:text-2xl font-bold text-emerald-400">
                  {rooms.length}{" "}
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({lockedRoomsCount} pvt)
                  </span>
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                  <Shield size={13} className="text-amber-400" />
                  <span>Staff Elevated</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-amber-300">
                  {adminCount} Adm / {managerCount} Mgr
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                  <Ban size={13} className="text-rose-400" />
                  <span>Suspensions</span>
                </div>
                <div className="text-lg sm:text-2xl font-bold text-rose-400">{bannedCount}</div>
              </div>
            </div>

          </div>
        </section>

        {/* MODERN SEGMENTED TABS NAVIGATION */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#12131C] border border-white/10 p-1 rounded-2xl shadow-lg">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "users"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Users size={14} className="shrink-0" />
            <span className="truncate">Members ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("rooms")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "rooms"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Radio size={14} className="shrink-0" />
            <span className="truncate">Rooms ({rooms.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("desk")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "desk"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <ShieldAlert size={14} className="shrink-0 text-rose-400" />
            <span className="truncate">Desk</span>
            {totalDeskCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {totalDeskCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "stats"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Sparkles size={14} className="shrink-0" />
            <span className="truncate">Policies</span>
          </button>
        </div>

        {/* TAB 1: USERS MANAGEMENT */}
        {activeTab === "users" && (
          <div className="space-y-4">
            
            {/* Search Bar & Role Filter Pills */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#11121A] border border-white/10 p-3 rounded-2xl shadow-md">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, handle, or bio..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-black/40 border border-white/5 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {userSearch && (
                  <button
                    onClick={() => setUserSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Horizontal Scroll Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {(["all", "super_admin", "admin", "manager", "user", "banned"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      roleFilter === r
                        ? "bg-white/20 text-white shadow-sm"
                        : "bg-black/30 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {r === "super_admin" ? "Founder" : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Read-only note for non-main admins */}
            {!isMainAdmin && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
                <Info size={14} className="text-amber-400 shrink-0" />
                <span>
                  {isManager ? (
                    <>
                      <strong>Manager View:</strong> You have moderation authority inside voice junctions to ban and unban participants from rooms. Platform-level user suspensions and deletions require Administrator clearance.
                    </>
                  ) : (
                    <>
                      <strong>Admin View:</strong> You can suspend accounts, delete users, and terminate rooms. Role promotions are restricted to Main Admin.
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Loading Skeleton */}
            {isLoadingData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-36 rounded-2xl bg-[#11121A] border border-white/5 animate-pulse p-4 space-y-3" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoadingData && filteredUsers.length === 0 && (
              <div className="py-12 text-center text-slate-500 bg-[#11121A] border border-white/5 rounded-3xl text-sm">
                No members found matching &quot;{userSearch}&quot;
              </div>
            )}

            {/* MOBILE VIEW: RESPONSIVE CARDS (ZERO HORIZONTAL SCROLL) */}
            {!isLoadingData && (
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredUsers.map((u) => {
                const isThisUserMainAdmin = u.role === "super_admin";

                return (
                  <div
                    key={u.id}
                    className="bg-[#11121A] border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg"
                  >
                    {/* Top row: Avatar + Name + Handle + Status Badge */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-900/40 border border-white/10 shrink-0 flex items-center justify-center">
                          {u.avatar && typeof u.avatar === "string" && u.avatar.includes("http") ? (
                            <img src={u.avatar} alt={u.username || "user"} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={u.avatar || "user"} color="#6366F1" size="md" className="!rounded-full" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-sm truncate max-w-[130px]">
                              {u.displayName || u.username}
                            </span>
                            <button
                              onClick={() => {
                                setPendingNameEdit({
                                  targetId: u.id,
                                  targetUsername: u.username,
                                  currentDisplayName: u.displayName || u.username,
                                });
                                setNewDisplayNameInput(u.displayName || u.username);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-white"
                              title="Edit name"
                            >
                              <Edit3 size={11} />
                            </button>
                            {isThisUserMainAdmin && (
                              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                FOUNDER
                              </span>
                            )}
                          </div>

                          <Link
                            href={`/profile/${u.id}`}
                            className="text-xs text-indigo-300 hover:underline flex items-center gap-0.5 truncate"
                          >
                            <span>@{u.username}</span>
                            <ExternalLink size={10} className="text-slate-500 shrink-0" />
                          </Link>
                        </div>
                      </div>

                      {/* Status Dot Pill */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          u.is_banned
                            ? "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                            : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {u.is_banned ? "Suspended" : "Active"}
                      </span>
                    </div>

                    {/* Bio Snippet (if any) */}
                    {u.bio && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 bg-black/20 p-2 rounded-xl border border-white/5">
                        {u.bio}
                      </p>
                    )}

                    {/* Bottom Action Bar: Role Dropdown + Quick Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                      {/* Role selection */}
                      <div className="flex-1 min-w-0">
                        {isThisUserMainAdmin ? (
                          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                            <Crown size={12} className="text-amber-400" />
                            Root Main Admin
                          </span>
                        ) : isMainAdmin ? (
                          <select
                            value={u.role || "user"}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRole;
                              setPendingAction({
                                type: "role_change",
                                targetId: u.id,
                                targetName: u.username,
                                newRole: nextRole,
                              });
                            }}
                            className="w-full bg-black/60 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="user">Member (Default)</option>
                            <option value="manager">⭐ Manager</option>
                            <option value="admin">🛡️ Admin</option>
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400 capitalize">
                            Role: {u.role || "Member"}
                          </span>
                        )}
                      </div>

                      {/* Action buttons (Ban / Delete) */}
                      {!isThisUserMainAdmin && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Ban Button (Admins Only) */}
                          {canSuspendPlatformUser(u) && (
                            <button
                              onClick={() => {
                                setPendingAction({
                                  type: "toggle_ban",
                                  targetId: u.id,
                                  targetName: u.username,
                                  newBanState: !u.is_banned,
                                });
                              }}
                              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
                                u.is_banned
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              }`}
                              title={u.is_banned ? "Lift Ban" : "Suspend Account"}
                            >
                              {u.is_banned ? <Unlock size={13} /> : <Ban size={13} />}
                            </button>
                          )}

                          {/* Delete Account */}
                          {(isMainAdmin || isStaffAdmin) && (
                            <button
                              onClick={() => {
                                setPendingAction({
                                  type: "delete_user",
                                  targetId: u.id,
                                  targetName: u.username,
                                });
                              }}
                              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                              title="Delete Account"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}

                          {isManager && !isStaffAdmin && !isMainAdmin && (
                            <span className="text-[10px] text-slate-500 italic">View Only</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {/* DESKTOP VIEW: POLISHED MODERN DATA TABLE */}
            {!isLoadingData && (
              <div className="hidden md:block bg-[#11121A] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-slate-400 font-semibold">
                      <th className="px-5 py-3.5">Member</th>
                      <th className="px-5 py-3.5">Current Role</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-center">Assign Role</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.map((u) => {
                      const isThisUserMainAdmin = u.role === "super_admin";

                      return (
                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                          {/* Member Info */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-900/40 border border-white/10 shrink-0 flex items-center justify-center">
                                {u.avatar && typeof u.avatar === "string" && u.avatar.includes("http") ? (
                                  <img src={u.avatar} alt={u.username || "user"} className="w-full h-full object-cover" />
                                ) : (
                                  <UserAvatar avatar={u.avatar || "user"} color="#6366F1" size="md" className="!rounded-full" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-white truncate max-w-[180px]">
                                    {u.displayName || u.username}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setPendingNameEdit({
                                        targetId: u.id,
                                        targetUsername: u.username,
                                        currentDisplayName: u.displayName || u.username,
                                      });
                                      setNewDisplayNameInput(u.displayName || u.username);
                                    }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    title="Edit Shown Name"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <Link
                                    href={`/profile/${u.id}`}
                                    className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors truncate flex items-center gap-0.5"
                                    title="View Profile"
                                  >
                                    <span>@{u.username}</span>
                                    <ExternalLink size={10} className="text-slate-500" />
                                  </Link>
                                  {isThisUserMainAdmin && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      FOUNDER
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                                  {u.bio || "No bio set"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {isThisUserMainAdmin || u.role === "super_admin" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                <Crown size={12} className="text-amber-400" />
                                Main Admin
                              </span>
                            ) : u.role === "admin" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                                <Shield size={12} className="text-indigo-400" />
                                Admin
                              </span>
                            ) : u.role === "manager" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                                <Sparkles size={12} className="text-emerald-400" />
                                Manager
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300">
                                Member
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {u.is_banned ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-300">
                                <Ban size={11} className="text-rose-400" />
                                Suspended
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Active
                              </span>
                            )}
                          </td>

                          {/* Role Select Dropdown */}
                          <td className="px-5 py-4 text-center whitespace-nowrap">
                            {isThisUserMainAdmin ? (
                              <span className="text-[11px] text-slate-500 italic">Root Authority</span>
                            ) : isMainAdmin ? (
                              <select
                                value={u.role || "user"}
                                onChange={(e) => {
                                  const nextRole = e.target.value as UserRole;
                                  setPendingAction({
                                    type: "role_change",
                                    targetId: u.id,
                                    targetName: u.username,
                                    newRole: nextRole,
                                  });
                                }}
                                className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="user">User (Default)</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                            ) : (isStaffAdmin || isManager) && (u.role === "user" || !u.role) ? (
                              <select
                                value={u.role || "user"}
                                onChange={(e) => {
                                  const nextRole = e.target.value as UserRole;
                                  setPendingAction({
                                    type: "role_change",
                                    targetId: u.id,
                                    targetName: u.username,
                                    newRole: nextRole,
                                  });
                                }}
                                className="bg-black/50 border border-emerald-500/30 rounded-xl px-2.5 py-1.5 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                              >
                                <option value="user">User (Default)</option>
                                <option value="manager">⭐ Appoint Manager</option>
                              </select>
                            ) : (
                              <span
                                className="text-[11px] text-slate-500 border border-white/5 px-2 py-1 rounded-lg bg-black/20"
                                title="Only Main Admin can modify Admin & Manager roles"
                              >
                                Locked (Main Admin Only)
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {!isThisUserMainAdmin && (
                                <>
                                  {canSuspendPlatformUser(u) && (
                                    <button
                                      onClick={() => {
                                        setPendingAction({
                                          type: "toggle_ban",
                                          targetId: u.id,
                                          targetName: u.username,
                                          newBanState: !u.is_banned,
                                        });
                                      }}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                        u.is_banned
                                          ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                                          : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
                                      }`}
                                    >
                                      {u.is_banned ? (
                                        <>
                                          <Unlock size={12} />
                                          <span>Lift Ban</span>
                                        </>
                                      ) : (
                                        <>
                                          <Ban size={12} />
                                          <span>Suspend</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {(isMainAdmin || isStaffAdmin) && (
                                    <button
                                      onClick={() => {
                                        setPendingAction({
                                          type: "delete_user",
                                          targetId: u.id,
                                          targetName: u.username,
                                        });
                                      }}
                                      className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                                      title="Permanently remove user"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}

                                  {isManager && !isStaffAdmin && !isMainAdmin && (
                                    <span className="text-[11px] text-slate-500 italic">View Only</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}

          </div>
        )}

        {/* TAB 2: ACTIVE ROOMS & PRIVATE HANGOUTS */}
        {activeTab === "rooms" && (
          <div className="space-y-4">
            
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11121A] border border-white/10 p-3 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold px-1">Filter:</span>
                {(["all", "locked", "public"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRoomFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      roomFilter === f
                        ? "bg-indigo-600 text-white"
                        : "bg-black/30 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f === "locked" ? "🔒 Locked / Private" : f === "public" ? "🌐 Public" : "All Rooms"}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-slate-400">
                Total Rooms Online: <strong className="text-white">{filteredRooms.length}</strong>
              </span>
            </div>

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRooms.length === 0 ? (
                <div className="col-span-full py-14 text-center text-slate-500 bg-[#11121A] border border-white/5 rounded-3xl text-sm">
                  No active voice hangouts matching this filter.
                </div>
              ) : (
                filteredRooms.map((room) => {
                  const isLocked = Boolean(room.isLocked);

                  return (
                    <div
                      key={room.id}
                      className="bg-[#11121A] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between hover:border-white/20 transition-all group"
                    >
                      <div>
                        {/* Top Bar: Category & Privacy Badge */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                            {room.category}
                          </span>

                          {isLocked ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                              <Lock size={10} className="text-amber-400" />
                              Private
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Public
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <h2 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors mb-1 truncate">
                          {room.name}
                        </h2>
                        <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                          {room.description || "Voice hangout space"}
                        </p>

                        {/* Live Participant Avatars */}
                        <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 mb-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                            <span>Live Speakers</span>
                            <span className="font-semibold text-white">
                              {room.currentCount} / {room.maxParticipants}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap min-h-[28px]">
                            {room.participants && room.participants.length > 0 ? (
                              room.participants.map((p, idx) => (
                                <div
                                  key={idx}
                                  className="w-6 h-6 rounded-full bg-indigo-900/40 border border-white/10 overflow-hidden flex items-center justify-center text-[9px]"
                                  title={`${p.name} (${p.role})`}
                                >
                                  {p.avatar && typeof p.avatar === "string" && p.avatar.includes("http") ? (
                                    <img src={p.avatar} alt={p.name || "speaker"} className="w-full h-full object-cover" />
                                  ) : (
                                    <UserAvatar avatar={p.avatar || "user"} color="#6366F1" size="sm" className="!rounded-full" />
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No speakers connected</span>
                            )}
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-500 mb-3 truncate">
                          Creator: <strong className="text-slate-400">{room.creatorId || "System"}</strong>
                        </div>
                      </div>

                      {/* Terminate Room Button */}
                      <button
                        onClick={() => {
                          setPendingAction({
                            type: "delete_room",
                            targetId: room.id,
                            targetName: room.name,
                          });
                        }}
                        className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Force Terminate</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* TAB: MODERATION DESK (MANAGERS, ADMINS & SUPER ADMINS) */}
        {activeTab === "desk" && (
          <div className="space-y-4">
            {/* Desk Top Navigation Bar & Sub-Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#11121A] border border-white/10 p-3.5 rounded-2xl shadow-md">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  onClick={() => setDeskSubFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    deskSubFilter === "all"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-black/30 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All Infractions ({totalDeskCount})
                </button>
                <button
                  onClick={() => setDeskSubFilter("platform")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    deskSubFilter === "platform"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-black/30 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Platform Suspensions ({platformBannedUsers.length})
                </button>
                <button
                  onClick={() => setDeskSubFilter("rooms")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    deskSubFilter === "rooms"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-black/30 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Room-Level Bans ({roomBans.length})
                </button>
                <button
                  onClick={() => setDeskSubFilter("reports")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    deskSubFilter === "reports"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-black/30 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Reports & Flags ({reportedParticipants.length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-64">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search desk by handle or room..."
                  value={deskSearch}
                  onChange={(e) => setDeskSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Clearance Notice for Managers */}
            {isManager && !isStaffAdmin && !isMainAdmin && (
              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-200">
                <Info size={16} className="text-indigo-400 shrink-0" />
                <span>
                  <strong>Manager Clearance:</strong> You have full visibility into platform infractions and the ability to unban users from rooms. Lifting platform-level suspensions requires Admin or Super Admin clearance.
                </span>
              </div>
            )}

            {/* SECTION 1: PLATFORM SUSPENSIONS */}
            {(deskSubFilter === "all" || deskSubFilter === "platform") && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldAlert size={16} className="text-rose-400" />
                    <span>Platform Suspensions</span>
                    <span className="text-[11px] font-normal text-slate-400">({platformBannedUsers.length})</span>
                  </h3>
                </div>

                {platformBannedUsers
                  .filter((u) => {
                    if (!deskSearch) return true;
                    const q = deskSearch.toLowerCase();
                    return (
                      (u.username || "").toLowerCase().includes(q) ||
                      (u.displayName || "").toLowerCase().includes(q) ||
                      (u.banned_reason || "").toLowerCase().includes(q)
                    );
                  })
                  .length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#11121A] border border-white/5 text-center text-xs text-slate-500">
                    No platform-level suspensions matching this view.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {platformBannedUsers
                      .filter((u) => {
                        if (!deskSearch) return true;
                        const q = deskSearch.toLowerCase();
                        return (
                          (u.username || "").toLowerCase().includes(q) ||
                          (u.displayName || "").toLowerCase().includes(q) ||
                          (u.banned_reason || "").toLowerCase().includes(q)
                        );
                      })
                      .map((bannedUser) => (
                        <div
                          key={bannedUser.id}
                          className="bg-[#11121A] border border-rose-500/20 rounded-2xl p-4 shadow-lg flex flex-col justify-between gap-3 hover:border-rose-500/40 transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                              <UserAvatar
                                avatar={bannedUser.avatar || "user"}
                                color="#F43F5E"
                                size="md"
                                className="!rounded-full border border-rose-500/30"
                              />
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-rose-600 border border-black flex items-center justify-center text-white">
                                <Ban size={10} />
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-bold text-white truncate">
                                  {bannedUser.displayName || bannedUser.username}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0 uppercase">
                                  Suspended
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 font-mono">@{bannedUser.username}</div>

                              {/* Ban Reason */}
                              <div className="mt-2 p-2 rounded-xl bg-black/40 border border-white/5 text-xs text-rose-200/90 leading-relaxed">
                                <span className="font-semibold text-rose-400">Reason: </span>
                                {bannedUser.banned_reason || "Violation of YapClub community guidelines"}
                              </div>
                            </div>
                          </div>

                          {/* Action row */}
                          <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-500">
                            <span>UID: {(bannedUser.id || "").slice(0, 8)}...</span>

                            {canSuspendPlatformUser(bannedUser) ? (
                              <button
                                onClick={() =>
                                  setPendingAction({
                                    type: "toggle_ban",
                                    targetId: bannedUser.id,
                                    targetName: bannedUser.username,
                                    newBanState: false,
                                  })
                                }
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                <CheckCircle2 size={13} />
                                <span>Lift Suspension</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">
                                Admin clearance required to unban
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 2: ROOM-LEVEL BANS */}
            {(deskSubFilter === "all" || deskSubFilter === "rooms") && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio size={16} className="text-amber-400" />
                    <span>Room-Level Bans</span>
                    <span className="text-[11px] font-normal text-slate-400">({roomBans.length})</span>
                  </h3>
                </div>

                {roomBans
                  .filter((b) => {
                    if (!deskSearch) return true;
                    const q = deskSearch.toLowerCase();
                    return (b.bannedIdentity || "").toLowerCase().includes(q) || (b.roomName || "").toLowerCase().includes(q);
                  })
                  .length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#11121A] border border-white/5 text-center text-xs text-slate-500">
                    No active room-level bans across live junctions.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {roomBans
                      .filter((b) => {
                        if (!deskSearch) return true;
                        const q = deskSearch.toLowerCase();
                        return (b.bannedIdentity || "").toLowerCase().includes(q) || (b.roomName || "").toLowerCase().includes(q);
                      })
                      .map((banItem, idx) => (
                        <div
                          key={`${banItem.roomId}-${banItem.bannedIdentity}-${idx}`}
                          className="bg-[#11121A] border border-amber-500/20 rounded-2xl p-4 shadow-lg flex flex-col justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                {banItem.roomCategory}
                              </span>
                              <span className="text-[10px] text-slate-400">Room Ban</span>
                            </div>

                            <div className="text-sm font-bold text-white mb-0.5 truncate">{banItem.roomName}</div>
                            <div className="text-xs text-rose-300 font-mono flex items-center gap-1.5 mt-2 p-2 bg-black/40 rounded-xl border border-white/5">
                              <Ban size={12} className="text-rose-400 shrink-0" />
                              <span className="truncate">@{banItem.bannedIdentity}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRoomUnban(banItem.roomId, banItem.bannedIdentity)}
                            className="w-full py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                          >
                            <Unlock size={12} />
                            <span>Unban from Room</span>
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: REPORTS & FLAGGED ACTIVITY */}
            {(deskSubFilter === "all" || deskSubFilter === "reports") && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Flag size={16} className="text-purple-400" />
                    <span>Reported Users in Active Rooms</span>
                    <span className="text-[11px] font-normal text-slate-400">({reportedParticipants.length})</span>
                  </h3>
                </div>

                {reportedParticipants
                  .filter((p) => {
                    if (!deskSearch) return true;
                    const q = deskSearch.toLowerCase();
                    return (
                      (p.identity || "").toLowerCase().includes(q) ||
                      (p.name || "").toLowerCase().includes(q) ||
                      (p.roomName || "").toLowerCase().includes(q)
                    );
                  })
                  .length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#11121A] border border-white/5 text-center text-xs text-slate-500">
                    No active reported participants inside rooms right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {reportedParticipants
                      .filter((p) => {
                        if (!deskSearch) return true;
                        const q = deskSearch.toLowerCase();
                        return (
                          (p.identity || "").toLowerCase().includes(q) ||
                          (p.name || "").toLowerCase().includes(q) ||
                          (p.roomName || "").toLowerCase().includes(q)
                        );
                      })
                      .map((reported, idx) => (
                        <div
                          key={`${reported.roomId}-${reported.identity}-${idx}`}
                          className="bg-[#11121A] border border-purple-500/20 rounded-2xl p-4 shadow-lg flex items-start justify-between gap-3"
                        >
                          <div className="flex items-start gap-3">
                            <UserAvatar
                              avatar={reported.avatar || "user"}
                              color="#A855F7"
                              size="md"
                              className="!rounded-full border border-purple-500/30 shrink-0"
                            />
                            <div>
                              <div className="text-sm font-bold text-white">{reported.name}</div>
                              <div className="text-xs text-slate-400 font-mono">@{reported.identity}</div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                Room: <strong className="text-purple-300">{reported.roomName}</strong>
                              </div>
                              <div className="text-[11px] text-rose-300 font-semibold mt-1 flex items-center gap-1">
                                <Flag size={11} className="text-rose-400" />
                                <span>Reported by {reported.reportedBy.length} member(s)</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0">
                            {isMainAdmin || isStaffAdmin ? (
                              <button
                                onClick={() =>
                                  setPendingAction({
                                    type: "toggle_ban",
                                    targetId: reported.identity,
                                    targetName: reported.name,
                                    newBanState: true,
                                  })
                                }
                                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold cursor-pointer transition-all"
                              >
                                Suspend Account
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SYSTEM RULES & SECURITY POLICY */}
        {activeTab === "stats" && (
          <div className="space-y-4">
            <div className="bg-[#11121A] border border-white/10 rounded-3xl p-5 sm:p-7 space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={18} className="text-indigo-400" />
                  Administrative Hierarchy & Platform Policy
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  YapClub operates with a strict role hierarchy to protect members and preserve platform stability.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs sm:text-sm">
                    <Crown size={15} className="text-amber-400" />
                    Main Admin (jayanthadmin)
                  </div>
                  <ul className="text-[11px] sm:text-xs text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li>Absolute platform root authority.</li>
                    <li>Exclusive right to promote/demote Admins.</li>
                    <li>Exclusive right to toggle Platform Maintenance Mode.</li>
                    <li>Cannot be banned, demoted, or deleted.</li>
                    <li>Can terminate any room (public or private).</li>
                  </ul>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs sm:text-sm">
                    <Shield size={15} className="text-indigo-400" />
                    Appointed Admins
                  </div>
                  <ul className="text-[11px] sm:text-xs text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li>Platform moderation authority.</li>
                    <li>Can terminate private and public rooms.</li>
                    <li>Can suspend abusive regular users.</li>
                    <li><strong>Strict restriction:</strong> Cannot appoint fellow admins.</li>
                    <li>Cannot ban or demote fellow staff or root admin.</li>
                  </ul>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs sm:text-sm">
                    <Sparkles size={15} className="text-emerald-400" />
                    Managers
                  </div>
                  <ul className="text-[11px] sm:text-xs text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li>Deck and speaker moderation authority.</li>
                    <li>Can mute, kick, and organize stage speakers.</li>
                    <li>Distinguished with a ⭐ Manager profile badge.</li>
                    <li>Access to Staff Desk to inspect bans and unban from rooms.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* CONFIRMATION ACTION MODAL */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-white/15 rounded-3xl max-w-sm sm:max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 text-indigo-400">
              {pendingAction.type === "delete_room" || pendingAction.type === "delete_user" ? (
                <Trash2 size={22} className="text-rose-400" />
              ) : pendingAction.type === "toggle_ban" ? (
                <Ban size={22} className="text-amber-400" />
              ) : (
                <Crown size={22} className="text-amber-400" />
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white mb-1.5">
              {pendingAction.type === "role_change" && `Promote / Demote @${pendingAction.targetName}`}
              {pendingAction.type === "toggle_ban" &&
                (pendingAction.newBanState ? `Suspend @${pendingAction.targetName}` : `Lift Suspension on @${pendingAction.targetName}`)}
              {pendingAction.type === "delete_user" && `Permanently Delete @${pendingAction.targetName}`}
              {pendingAction.type === "delete_room" && `Terminate "${pendingAction.targetName}"`}
            </h3>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {pendingAction.type === "role_change" && (
                <>
                  Change @{pendingAction.targetName}&apos;s role to{" "}
                  <strong className="text-amber-300 uppercase">{pendingAction.newRole}</strong>?
                </>
              )}
              {pendingAction.type === "toggle_ban" &&
                (pendingAction.newBanState
                  ? "This user will be disconnected from voice rooms and blocked from participating."
                  : "This user will regain full access to voice hangouts and messaging.")}
              {pendingAction.type === "delete_user" &&
                "Irreversible action. Messages, rooms, and profile data will be deleted."}
              {pendingAction.type === "delete_room" &&
                "This hangout will terminate immediately and all speakers will be ejected."}
            </p>

            {pendingAction.type === "toggle_ban" && pendingAction.newBanState && (
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Reason for Suspension:
                </label>
                <input
                  type="text"
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setPendingAction(null)}
                disabled={isSubmittingAction}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={isSubmittingAction}
                onClick={() => {
                  if (pendingAction.type === "role_change" && pendingAction.newRole) {
                    handleRoleChange(pendingAction.targetId, pendingAction.newRole);
                  } else if (pendingAction.type === "toggle_ban") {
                    handleToggleBan(
                      pendingAction.targetId,
                      Boolean(pendingAction.newBanState),
                      banReasonInput
                    );
                  } else if (pendingAction.type === "delete_user") {
                    handleDeleteUser(pendingAction.targetId);
                  } else if (pendingAction.type === "delete_room") {
                    handleDeleteRoom(pendingAction.targetId);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer transition-colors ${
                  pendingAction.type === "delete_room" || pendingAction.type === "delete_user"
                    ? "bg-rose-600 hover:bg-rose-500"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {isSubmittingAction ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHOWN NAME EDIT MODAL */}
      {pendingNameEdit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-white/15 rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 text-indigo-400">
              <Edit3 size={20} />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white mb-1">
              Edit Shown Name
            </h3>
            <p className="text-xs text-slate-400 mb-3.5">
              Update display name for <strong className="text-slate-200">@{pendingNameEdit.targetUsername}</strong>.
            </p>

            <div className="mb-4">
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Display Name:
              </label>
              <input
                type="text"
                value={newDisplayNameInput}
                onChange={(e) => setNewDisplayNameInput(e.target.value)}
                maxLength={32}
                placeholder="e.g. John Doe"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUpdateDisplayName(pendingNameEdit.targetId, newDisplayNameInput);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setPendingNameEdit(null)}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={isSavingName || !newDisplayNameInput.trim()}
                onClick={() => handleUpdateDisplayName(pendingNameEdit.targetId, newDisplayNameInput)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                {isSavingName ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
