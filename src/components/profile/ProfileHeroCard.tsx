"use client";

import { useState, useEffect } from "react";
import {
  Camera,
  Check,
  Edit3,
  Loader2,
  Lock,
  MessageSquare,
  Quote,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  UserCheck,
  UserPlus,
  Ban,
  Clock,
  Calendar,
  Radio,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge } from "@/components/ui/RoleBadge";
import {
  ProfileRecord,
  isImageAvatarUrl,
  formatMemberSince,
} from "@/lib/profile-constants";

interface ProfileHeroCardProps {
  profile: ProfileRecord;
  isOwner: boolean;
  isRegisteredOwner: boolean;
  isOnline: boolean;
  followersCount: number;
  followingCount: number;
  pendingRequestsCount: number;
  canViewConnections: boolean;
  isFollowing: boolean;
  followsMe: boolean;
  hasPendingRequestFromMe: boolean;
  hasPendingRequestFromThem: boolean;
  isAcceptedConnection: boolean;
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
  isConnecting: boolean;
  isBlockingAction: boolean;
  isUploadingAvatar: boolean;
  onOpenAvatarModal: () => void;
  onOpenConnections: (mode: "followers" | "following" | "requests") => void;
  onSaveProfileDetails: (updates: { displayName: string; bio: string }) => Promise<boolean>;
  onSendFollowRequest: () => void;
  onCancelFollowRequest: () => void;
  onAcceptFollowRequest: () => void;
  onDeclineFollowRequest: () => void;
  onUnfollowUser: () => void;
  onUnblockUser: () => void;
  onStartMessage: () => void;
  onJumpToThemeTab?: () => void;
}

export function ProfileHeroCard({
  profile,
  isOwner,
  isRegisteredOwner,
  isOnline,
  followersCount,
  followingCount,
  pendingRequestsCount,
  canViewConnections,
  isFollowing,
  followsMe,
  hasPendingRequestFromMe,
  hasPendingRequestFromThem,
  isAcceptedConnection,
  isBlockedByMe,
  hasBlockedMe,
  isConnecting,
  isBlockingAction,
  isUploadingAvatar,
  onOpenAvatarModal,
  onOpenConnections,
  onSaveProfileDetails,
  onSendFollowRequest,
  onCancelFollowRequest,
  onAcceptFollowRequest,
  onDeclineFollowRequest,
  onUnfollowUser,
  onUnblockUser,
  onStartMessage,
  onJumpToThemeTab,
}: ProfileHeroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState(profile.display_name || profile.username);
  const [bioInput, setBioInput] = useState(profile.bio || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDisplayNameInput(profile.display_name || profile.username || "");
      setBioInput(profile.bio || "");
    }
  }, [profile.display_name, profile.username, profile.bio, isEditing]);

  const cardBg = profile.card_bg_color || profile.social_links?.card_bg_color || "#465B73";
  const isProfileGuest = Boolean(profile.isGuestProfile || profile.id?.startsWith("guest_"));
  const profileRole =
    profile.role === "super_admin" || profile.role === "admin" || profile.role === "manager"
      ? profile.role
      : "user";
  const memberSince = formatMemberSince(profile.created_at);
  const vibeStatus = profile.social_links?.vibe_status;
  const showPresenceDot = !hasBlockedMe && !isBlockedByMe && isOnline;

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await onSaveProfileDetails({
      displayName: displayNameInput,
      bio: bioInput,
    });
    setIsSaving(false);
    if (ok) {
      setIsEditing(false);
    }
  };

  return (
    <div className="bg-[#12131A]/95 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden relative group">
      {/* Gradient-Compatible Cover Banner Accent */}
      <div
        className="h-28 sm:h-32 w-full relative transition-all duration-500 border-b border-white/10 overflow-hidden"
        style={{ background: cardBg }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/15 to-[#12131A]" />
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

        {isOwner && onJumpToThemeTab ? (
          <button
            type="button"
            onClick={onJumpToThemeTab}
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-semibold text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Sparkles size={11} className="text-indigo-300" />
            <span>Edit Card Theme</span>
          </button>
        ) : (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-medium text-slate-300 flex items-center gap-1.5">
            <Sparkles size={11} className="text-indigo-400" />
            <span>Voice Card Theme</span>
          </div>
        )}
      </div>

      {/* Profile Details Container */}
      <div className="px-5 sm:px-6 pb-6 relative flex flex-col items-center text-center -mt-14">
        {/* Blocked by viewer banner */}
        {isBlockedByMe && (
          <div className="w-full mb-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in">
            <ShieldAlert size={14} className="text-amber-400 shrink-0" />
            <span>You have blocked @{profile.username}</span>
          </div>
        )}

        {/* Avatar with Ring + Online Indicator */}
        <div className="relative mb-2 flex flex-col items-center">
          <div className="relative">
            <div
              onClick={() => isOwner && onOpenAvatarModal()}
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-[#12131A] shadow-2xl bg-indigo-900/40 flex items-center justify-center relative ${
                isOwner ? "cursor-pointer group/avatar" : ""
              }`}
              title={isOwner ? "Click to customize avatar" : undefined}
            >
              {isImageAvatarUrl(profile.avatar) ? (
                <img
                  src={profile.avatar}
                  alt={profile.display_name || profile.username}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <UserAvatar
                  avatar={profile.avatar || "sparkles"}
                  color="#6366F1"
                  size="lg"
                  className="!rounded-full !w-full !h-full"
                  badgeRole={profileRole !== "user" ? profileRole : undefined}
                />
              )}

              {isOwner && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1 backdrop-blur-[2px]">
                  <Camera size={20} className="text-white drop-shadow" />
                  <span>Change Avatar</span>
                </div>
              )}
            </div>

            {showPresenceDot && !isOwner && (
              <span
                title="Online now"
                className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 border-[3px] border-[#12131A] shadow-[0_0_10px_rgba(52,211,153,0.8)]"
              />
            )}

            {isOwner && (
              <button
                type="button"
                onClick={onOpenAvatarModal}
                disabled={isUploadingAvatar}
                className="absolute bottom-0.5 right-0.5 w-8 h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer border-2 border-[#12131A] z-10"
                title="Customize Avatar"
                aria-label="Customize Avatar"
              >
                {isUploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
            )}
          </div>

          {isOwner && (
            <button
              type="button"
              onClick={onOpenAvatarModal}
              disabled={isUploadingAvatar}
              className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Camera size={12} />
              <span>Change Photo or Icon</span>
            </button>
          )}
        </div>

        {/* Shown Name & Edit Button */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>{profile.display_name || profile.username}</span>
            {profileRole !== "user" && <RoleBadge role={profileRole} size="xs" showLabel={false} />}
          </h1>
          {isOwner && !isEditing && (
            <button
              type="button"
              onClick={() => {
                setDisplayNameInput(profile.display_name || profile.username || "");
                setBioInput(profile.bio || "");
                setIsEditing(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 transition-all cursor-pointer active:scale-95 shadow-sm"
              title="Edit Shown Name & Bio"
            >
              <Edit3 size={12} className="text-indigo-400" />
              <span>Edit</span>
            </button>
          )}
        </div>

        <div className="text-xs sm:text-sm font-semibold text-indigo-300/80 mb-2">
          @{profile.username}
        </div>

        {/* Role, Account Type, Presence & Join Date Pills */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap justify-center">
          {hasBlockedMe ? (
            <span className="text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full flex items-center gap-1">
              <ShieldAlert size={12} className="text-rose-400" />
              Account Unavailable
            </span>
          ) : profile.is_banned ? (
            <span className="text-[11px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
              <Ban size={12} className="text-rose-400" />
              Account Suspended
            </span>
          ) : (
            <>
              {profileRole !== "user" ? (
                <RoleBadge role={profileRole} size="sm" showLabel={true} />
              ) : (
                <span className="text-[11px] font-semibold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <ShieldCheck size={12} className={!isProfileGuest ? "text-indigo-400" : "text-amber-400"} />
                  {!isProfileGuest ? "Registered Member" : "Guest Handle"}
                </span>
              )}

              {showPresenceDot && (
                <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              )}

              {memberSince && (
                <span className="text-[11px] font-medium text-slate-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Calendar size={11} className="text-slate-400" />
                  Joined {memberSince}
                </span>
              )}
            </>
          )}
        </div>

        {/* Vibe Status Pill */}
        {!hasBlockedMe && vibeStatus && (
          <div className="mb-3 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-200 flex items-center gap-1.5 max-w-full">
            <Radio size={11} className="text-indigo-400 shrink-0" />
            <span className="truncate">{vibeStatus}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="w-full grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-black/40 border border-white/5 mb-3">
          {hasBlockedMe ? (
            <>
              <div className="flex flex-col items-center py-1.5 rounded-xl opacity-60">
                <span className="font-extrabold text-white text-base sm:text-lg">--</span>
                <span className="text-slate-400 text-xs font-medium">Followers</span>
              </div>
              <div className="flex flex-col items-center py-1.5 rounded-xl opacity-60">
                <span className="font-extrabold text-white text-base sm:text-lg">--</span>
                <span className="text-slate-400 text-xs font-medium">Following</span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenConnections("followers")}
                className="flex flex-col items-center py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white text-base sm:text-lg">{followersCount}</span>
                  {!canViewConnections && (
                    <Lock size={12} className="text-slate-500 group-hover:text-slate-400 transition-colors" />
                  )}
                </div>
                <span className="text-slate-400 text-xs font-medium">Followers</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenConnections("following")}
                className="flex flex-col items-center py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white text-base sm:text-lg">{followingCount}</span>
                  {!canViewConnections && (
                    <Lock size={12} className="text-slate-500 group-hover:text-slate-400 transition-colors" />
                  )}
                </div>
                <span className="text-slate-400 text-xs font-medium">Following</span>
              </button>
            </>
          )}
        </div>

        {/* Owner Quick Access: Pending Incoming Follow Requests */}
        {isOwner && isRegisteredOwner && pendingRequestsCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenConnections("requests")}
            className="w-full mb-3 px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer active:scale-[0.99]"
          >
            <span className="flex items-center gap-2">
              <UserPlus size={14} className="text-indigo-400" />
              <span>Pending Follow Requests</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              {pendingRequestsCount}
            </span>
          </button>
        )}

        {/* Bio Box */}
        <div className="w-full">
          {hasBlockedMe ? (
            <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 text-center w-full">
              <p className="text-slate-500 text-xs italic">This account is unavailable.</p>
            </div>
          ) : isEditing ? (
            <div className="flex flex-col gap-2.5 text-left p-3.5 rounded-2xl bg-black/40 border border-indigo-500/30">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Shown Name (Display Name)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {displayNameInput.length}/32
                  </span>
                </div>
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="e.g. Jay"
                  maxLength={32}
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs font-semibold"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    About / Bio
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {bioInput.length}/150
                  </span>
                </div>
                <textarea
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Write a short bio about what you love to talk about..."
                  maxLength={150}
                  className="w-full h-20 p-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setBioInput(profile.bio || "");
                    setDisplayNameInput(profile.display_name || profile.username || "");
                  }}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/25 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative group p-3.5 rounded-2xl bg-black/30 border border-white/5 hover:border-white/10 transition-colors text-center w-full">
              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-400 mb-1">
                <Quote size={12} className="text-indigo-400" />
                <span>About</span>
              </div>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {profile.bio || <span className="text-slate-500 italic">No bio written yet.</span>}
              </p>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setDisplayNameInput(profile.display_name || profile.username || "");
                    setBioInput(profile.bio || "");
                    setIsEditing(true);
                  }}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
                  title="Edit Bio & Shown Name"
                  aria-label="Edit Bio & Shown Name"
                >
                  <Edit3 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Visitor / Connection Action Buttons */}
        {!isOwner && (
          <div className="w-full mt-4">
            {hasBlockedMe ? (
              <div className="w-full py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                <ShieldAlert size={15} className="text-slate-500" />
                <span>Account Unavailable</span>
              </div>
            ) : isBlockedByMe ? (
              <button
                type="button"
                onClick={onUnblockUser}
                disabled={isBlockingAction}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {isBlockingAction ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
                <span>Unblock</span>
              </button>
            ) : hasPendingRequestFromThem ? (
              <div className="flex flex-col gap-2 w-full animate-in fade-in">
                <div className="text-[11px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
                  <UserPlus size={13} />
                  <span>Sent you a follow request</span>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={onAcceptFollowRequest}
                    disabled={isConnecting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>Accept Request</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDeclineFollowRequest}
                    disabled={isConnecting}
                    className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            ) : hasPendingRequestFromMe ? (
              <div className="flex items-center justify-center gap-2.5 w-full animate-in fade-in">
                <button
                  type="button"
                  onClick={onCancelFollowRequest}
                  disabled={isConnecting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all shadow-sm active:scale-95 cursor-pointer"
                  title="Click to cancel follow request"
                >
                  {isConnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Clock size={14} className="text-amber-400" />
                      <span>Requested (Cancel)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={true}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 text-slate-500 font-semibold text-xs cursor-not-allowed opacity-60"
                  title="Messaging is locked until the follow request is accepted"
                >
                  <Lock size={14} />
                  <span>Message (Locked)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={isFollowing ? onUnfollowUser : onSendFollowRequest}
                  disabled={isConnecting}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95 cursor-pointer ${
                    isFollowing
                      ? "bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-300 border border-white/10 hover:border-rose-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25"
                  }`}
                >
                  {isConnecting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : isFollowing ? (
                    <>
                      <UserCheck size={15} className="text-emerald-400" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} />
                      <span>{followsMe ? "Follow Back" : "Follow"}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={isAcceptedConnection ? onStartMessage : undefined}
                  disabled={isConnecting || !isAcceptedConnection}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-semibold text-xs transition-all shadow-md ${
                    isAcceptedConnection
                      ? "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 active:scale-95 cursor-pointer"
                      : "bg-white/5 border border-white/5 text-slate-500 cursor-not-allowed opacity-60"
                  }`}
                  title={
                    isAcceptedConnection
                      ? "Send direct message"
                      : "Follow request must be accepted before you can message this user"
                  }
                >
                  {isConnecting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : !isAcceptedConnection ? (
                    <>
                      <Lock size={14} />
                      <span>Message</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare size={15} />
                      <span>Message</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
