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
  Crown,
  Ban,
  Trash2,
  Lock,
  Unlock,
  Radio,
  Users,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  UserX,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import Link from "next/link";

interface AdminUserRecord {
  id: string;
  username: string;
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
  }>;
  createdAt: number;
}

export default function AdminPortalPage() {
  const router = useRouter();
  const { user, isLoaded, isRegistered } = useUser();

  const [activeTab, setActiveTab] = useState<"users" | "rooms" | "stats">("users");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole | "banned">("all");
  const [roomFilter, setRoomFilter] = useState<"all" | "locked" | "public">("all");

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

  // Determine permissions
  const cleanName = user?.name?.trim().toLowerCase() || "";
  const isMainAdmin = user?.role === "super_admin" || cleanName === "jayanthadmin" || cleanName === "jayanth";
  const isStaffAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const hasAdminAccess = isMainAdmin || isStaffAdmin || isManager;

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
  }, [isLoaded, user?.id, hasAdminAccess, isRegistered]);

  // Handle Role Change
  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (newRole === "admin" && !isMainAdmin) {
      showToast("error", "Only Main Admin (jayanthadmin) can appoint Admins.");
      return;
    }

    setIsSubmittingAction(true);
    try {
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

      showToast("success", data.message || "Role updated successfully");
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
      );
      setPendingAction(null);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Ban / Unban
  const handleToggleBan = async (targetUserId: string, shouldBan: boolean, reason?: string) => {
    setIsSubmittingAction(true);
    try {
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

      showToast("success", data.message || "Ban status updated");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUserId
            ? { ...u, is_banned: shouldBan, banned_reason: shouldBan ? reason : undefined }
            : u
        )
      );
      setPendingAction(null);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle User Account Deletion
  const handleDeleteUser = async (targetUserId: string) => {
    setIsSubmittingAction(true);
    try {
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

  // Handle Room Deletion (Force Delete Private / Public Room)
  const handleDeleteRoom = async (junctionId: string) => {
    setIsSubmittingAction(true);
    try {
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

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.bio && u.bio.toLowerCase().includes(userSearch.toLowerCase())) ||
        u.id.toLowerCase().includes(userSearch.toLowerCase());

      if (!matchesSearch) return false;

      if (roleFilter === "all") return true;
      if (roleFilter === "banned") return u.is_banned;
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
  const publicRoomsCount = rooms.filter((r) => !r.isLocked).length;

  // Access denied screen
  if (isLoaded && (!user || !isRegistered || !hasAdminAccess)) {
    return (
      <div className="min-h-screen bg-[#0A0B10] text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#12131A] border border-rose-500/20 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <ShieldAlertIcon size={32} />
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
    <div className="min-h-screen bg-[#0A0B10] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl text-sm font-semibold animate-in slide-in-from-bottom-5 duration-300 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/90 border-rose-500/40 text-rose-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* ADMIN HERO BANNER */}
        <div className="relative rounded-3xl bg-gradient-to-br from-[#121422] via-[#11121C] to-[#171424] border border-white/10 p-6 sm:p-8 shadow-2xl overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  YapClub Executive Portal
                </span>

                {isMainAdmin ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                    <Crown size={14} className="text-amber-400" />
                    Root Main Admin: @jayanthadmin
                  </span>
                ) : isStaffAdmin ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-center gap-1.5">
                    <Shield size={14} />
                    Administrator Staff
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    Community Manager Staff
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Control & Moderation Console
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed">
                {isMainAdmin ? (
                  <>
                    Welcome back, <strong className="text-amber-300">jayanthadmin</strong>. You hold full root control. You
                    alone have the authority to appoint Admins, and can promote, demote, ban, or unban anyone (including Admins and Managers).
                  </>
                ) : isStaffAdmin ? (
                  <>
                    Logged in as Administrator <strong className="text-indigo-300">@{user?.name}</strong>. You have authority to
                    appoint Managers, moderate regular users, and terminate active rooms. Only Main Admin can appoint Admins or moderate Admins & Managers.
                  </>
                ) : (
                  <>
                    Logged in as Community Manager <strong className="text-emerald-300">@{user?.name}</strong>. You have permissions to
                    appoint new Managers and manage room hangouts. Only Main Admin can appoint Admins or moderate staff.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                <span>{isRefreshing ? "Refreshing..." : "Refresh Data"}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/5">
            <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
              <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <Users size={13} className="text-indigo-400" />
                <span>Total Members</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{totalUsersCount}</div>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
              <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <Radio size={13} className="text-emerald-400" />
                <span>Active Rooms</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-400">
                {rooms.length}{" "}
                <span className="text-xs text-slate-400 font-normal">
                  ({lockedRoomsCount} private)
                </span>
              </div>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
              <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <Shield size={13} className="text-amber-400" />
                <span>Staff Elevated</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-300">
                {adminCount} Admins / {managerCount} Mgrs
              </div>
            </div>

            <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
              <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <Ban size={13} className="text-rose-400" />
                <span>Banned Accounts</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-rose-400">{bannedCount}</div>
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "users"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Users size={16} />
            <span>Members & Roles ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("rooms")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "rooms"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Radio size={16} />
            <span>Active Hangouts & Private Rooms ({rooms.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "stats"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Sparkles size={16} />
            <span>System Rules & Security</span>
          </button>
        </div>

        {/* TAB 1: USERS MANAGEMENT */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#12131A] border border-white/10 p-3.5 rounded-2xl">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user by username, ID, or bio..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/5 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(["all", "super_admin", "admin", "manager", "user", "banned"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer ${
                      roleFilter === r
                        ? "bg-white/20 text-white"
                        : "bg-black/30 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {r === "super_admin" ? "SuperAdmin" : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Strict Notice banner for fellow Admins */}
            {!isMainAdmin && (
              <div className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2.5">
                <Info size={16} className="text-amber-400 shrink-0" />
                <span>
                  <strong>Admin View Mode:</strong> You can suspend accounts and delete rooms. Role promotions and demotions are restricted to Main Admin (jayanthadmin).
                </span>
              </div>
            )}

            {/* Users Table / List */}
            <div className="bg-[#12131A] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-slate-400 font-semibold">
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-5 py-3.5">Current Role</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-center">Assign Role</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-500">
                          No users found matching the query.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const cleanU = u.username.trim().toLowerCase();
                        const isThisUserMainAdmin = cleanU === "jayanthadmin" || cleanU === "jayanth";

                        return (
                          <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                            {/* User Info */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-900/40 border border-white/10 shrink-0 flex items-center justify-center">
                                  {u.avatar.includes("http") ? (
                                    <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                                  ) : (
                                    <UserAvatar avatar={u.avatar} color="#6366F1" size="md" className="!rounded-full" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/profile/${u.id}`}
                                      className="font-bold text-white hover:text-indigo-300 transition-colors truncate flex items-center gap-1"
                                    >
                                      <span>@{u.username}</span>
                                      <ExternalLink size={12} className="text-slate-500" />
                                    </Link>
                                    {isThisUserMainAdmin && (
                                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        FOUNDER
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                    {u.bio || "No bio set"}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Current Role Badge */}
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

                            {/* Quick Actions (Ban / Delete) */}
                            <td className="px-5 py-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                {/* Ban / Unban Button */}
                                {!isThisUserMainAdmin && (
                                  (u.role === "admin" || u.role === "manager") && !isMainAdmin ? (
                                    <span
                                      className="px-2.5 py-1 rounded-xl text-[11px] text-slate-500 bg-white/[0.03] border border-white/5 cursor-not-allowed"
                                      title="Only Main Admin can moderate Admins & Managers"
                                    >
                                      Protected
                                    </span>
                                  ) : (
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
                                  )
                                )}

                                {/* Delete Account Button */}
                                {!isThisUserMainAdmin && (
                                  (u.role === "admin" || u.role === "manager") && !isMainAdmin ? null : (isMainAdmin || isStaffAdmin) ? (
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
                                  ) : null
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE ROOMS & PRIVATE HANGOUT MANAGEMENT */}
        {activeTab === "rooms" && (
          <div className="space-y-6">
            {/* Filter controls */}
            <div className="flex items-center justify-between gap-3 bg-[#12131A] border border-white/10 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold px-2">Filter Hangouts:</span>
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
                    {f === "locked" ? "🔒 Private / Locked" : f === "public" ? "🌐 Public" : "All Rooms"}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400 font-medium">
                Admins have full authority to delete any private room.
              </span>
            </div>

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRooms.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-500 bg-[#12131A] border border-white/5 rounded-3xl">
                  No active voice hangouts currently online.
                </div>
              ) : (
                filteredRooms.map((room) => {
                  const isLocked = Boolean(room.isLocked);

                  return (
                    <div
                      key={room.id}
                      className="bg-[#12131A] border border-white/10 rounded-3xl p-5 shadow-xl flex flex-col justify-between hover:border-white/20 transition-all group"
                    >
                      <div>
                        {/* Room Status Top Bar */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                            {room.category}
                          </span>

                          {isLocked ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                              <Lock size={11} className="text-amber-400" />
                              Private / Locked
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Public
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <h2 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors mb-1.5">
                          {room.name}
                        </h2>
                        <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                          {room.description || "Voice hangout space on YapClub"}
                        </p>

                        {/* Participant Avatars */}
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-3 mb-4">
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                            <span>Live Speakers</span>
                            <span className="font-semibold text-white">
                              {room.currentCount} / {room.maxParticipants}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap min-h-[32px]">
                            {room.participants && room.participants.length > 0 ? (
                              room.participants.map((p, idx) => (
                                <div
                                  key={idx}
                                  className="w-7 h-7 rounded-full bg-indigo-900/40 border border-white/10 overflow-hidden flex items-center justify-center text-[10px]"
                                  title={`${p.name} (${p.role})`}
                                >
                                  {p.avatar.includes("http") ? (
                                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <UserAvatar avatar={p.avatar} color="#6366F1" size="sm" className="!rounded-full" />
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">No users connected</span>
                            )}
                          </div>
                        </div>

                        {/* Creator Info */}
                        <div className="text-[11px] text-slate-500 mb-4">
                          Creator: <strong className="text-slate-400">{room.creatorId || "YapClub System"}</strong>
                        </div>
                      </div>

                      {/* Admin Force Delete Button */}
                      <button
                        onClick={() => {
                          setPendingAction({
                            type: "delete_room",
                            targetId: room.id,
                            targetName: room.name,
                          });
                        }}
                        className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Force Terminate Room</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM RULES & SECURITY POLICY */}
        {activeTab === "stats" && (
          <div className="space-y-6">
            <div className="bg-[#12131A] border border-white/10 rounded-3xl p-6 sm:p-8">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <ShieldCheck size={20} className="text-indigo-400" />
                Administrative Hierarchy & Authority Policy
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-2">
                    <Crown size={16} className="text-amber-400" />
                    Main Admin (jayanthadmin)
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4 leading-relaxed">
                    <li>Absolute platform root authority.</li>
                    <li>Exclusive right to promote/demote users to Admin or Manager.</li>
                    <li>Fellow admins cannot create other admins.</li>
                    <li>Cannot be banned, demoted, or deleted by anyone.</li>
                    <li>Can terminate any room (public, private, or locked).</li>
                  </ul>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm mb-2">
                    <Shield size={16} className="text-indigo-400" />
                    Appointed Admins
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4 leading-relaxed">
                    <li>Platform moderation authority.</li>
                    <li>Can terminate private and public rooms.</li>
                    <li>Can suspend and ban abusive regular users.</li>
                    <li><strong>Strict restriction:</strong> Cannot promote fellow admins or assign roles.</li>
                    <li>Cannot ban or demote jayanthadmin or fellow admins.</li>
                  </ul>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm mb-2">
                    <Sparkles size={16} className="text-emerald-400" />
                    Managers
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4 leading-relaxed">
                    <li>Room and deck moderation authority.</li>
                    <li>Can mute, kick, and manage voice stages.</li>
                    <li>Distinguished by ⭐ Manager profile badge.</li>
                    <li>No access to global admin portal or user deletions.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CONFIRMATION MODAL */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12131A] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
              {pendingAction.type === "delete_room" || pendingAction.type === "delete_user" ? (
                <Trash2 size={24} className="text-rose-400" />
              ) : pendingAction.type === "toggle_ban" ? (
                <Ban size={24} className="text-amber-400" />
              ) : (
                <Crown size={24} className="text-amber-400" />
              )}
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {pendingAction.type === "role_change" && `Promote / Demote @${pendingAction.targetName}`}
              {pendingAction.type === "toggle_ban" &&
                (pendingAction.newBanState ? `Suspend @${pendingAction.targetName}` : `Lift Suspension on @${pendingAction.targetName}`)}
              {pendingAction.type === "delete_user" && `Permanently Delete @${pendingAction.targetName}`}
              {pendingAction.type === "delete_room" && `Terminate "${pendingAction.targetName}"`}
            </h3>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {pendingAction.type === "role_change" && (
                <>
                  Are you sure you want to change @{pendingAction.targetName}&apos;s role to{" "}
                  <strong className="text-amber-300 uppercase">{pendingAction.newRole}</strong>?
                </>
              )}
              {pendingAction.type === "toggle_ban" &&
                (pendingAction.newBanState
                  ? "This user will be immediately disconnected from voice rooms and blocked from messaging or participating."
                  : "This user will regain full access to voice hangouts and messaging.")}
              {pendingAction.type === "delete_user" &&
                "This action is irreversible. All messages, custom hangouts, and profile data will be permanently wiped."}
              {pendingAction.type === "delete_room" &&
                "This voice hangout (including if private) will be terminated immediately. All active participants will be ejected."}
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

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPendingAction(null)}
                disabled={isSubmittingAction}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
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
                {isSubmittingAction ? "Processing..." : "Confirm Action"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShieldAlertIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}
