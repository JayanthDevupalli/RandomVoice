"use client";

import { useState } from "react";
import { Junction, JunctionParticipant } from "@/lib/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Shield,
  X,
  Mic,
  MicOff,
  UserX,
  Ban,
  Crown,
  Trash2,
  PhoneOff,
  AlertTriangle,
  Radio,
  CheckCircle2,
  Users,
  Settings
} from "lucide-react";

interface ModeratorControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  junction: Junction;
  currentModerator: string;
  onModerateParticipant: (targetIdentity: string, action: "mute" | "unmute" | "kick" | "ban" | "transfer_mod") => Promise<void>;
  onClearChat: () => void;
  onEndJunction: () => Promise<void>;
}

export function ModeratorControlModal({
  isOpen,
  onClose,
  junction,
  currentModerator,
  onModerateParticipant,
  onClearChat,
  onEndJunction,
}: ModeratorControlModalProps) {
  const [activeTab, setActiveTab] = useState<"participants" | "room">("participants");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 2500);
  };

  const handleParticipantAction = async (
    targetIdentity: string,
    action: "mute" | "unmute" | "kick" | "ban" | "transfer_mod",
    label: string
  ) => {
    try {
      setActionLoading(`${action}_${targetIdentity}`);
      await onModerateParticipant(targetIdentity, action);
      showNotice(`${label} applied to ${targetIdentity}`);
    } catch (err: any) {
      showNotice(err.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };



  const handleEndJunction = async () => {
    try {
      setActionLoading("end");
      await onEndJunction();
    } catch (err: any) {
      showNotice(err.message || "Failed to end junction");
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-card border border-amber-500/30 shadow-2xl text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Moderator Command Deck
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                  HOST
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Manage 7-seat junction security and participants</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-200 dark:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Notice Notification */}
        {statusNotice && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 size={15} />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 mt-3 mb-4 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("participants")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "participants"
                ? "bg-amber-500 text-black shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            <Users size={14} />
            <span>Participants ({junction.participants.length}/7)</span>
          </button>
          <button
            onClick={() => setActiveTab("room")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "room"
                ? "bg-amber-500 text-black shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            <Settings size={14} />
            <span>Room Controls</span>
          </button>
        </div>

        {/* Tab 1: Participants List & Controls */}
        {activeTab === "participants" && (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 no-scrollbar">
            {junction.participants.map((p, idx) => {
              const isMod = p.identity === junction.moderatorIdentity;
              const isSelf = p.identity === currentModerator;

              return (
                <div
                  key={p.id || p.identity || idx}
                  className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar avatar={p.avatar} color={p.color} size="sm" isSpeaking={p.isSpeaking} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate max-w-[120px]">
                          {p.name}
                        </span>
                        {isMod && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px] border border-amber-500/30">
                            <Crown size={10} />
                            MOD
                          </span>
                        )}
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-600/30 text-indigo-300 font-bold text-[9px]">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="font-mono">Seat #{idx + 1}</span>
                        <span>•</span>
                        <span className={p.isMuted || p.isMutedByMod ? "text-rose-400" : "text-emerald-400"}>
                          {p.isMutedByMod ? "Mod-Muted" : p.isMuted ? "Self-Muted" : "Active"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for other participants */}
                  {!isSelf && (
                    <div className="flex items-center gap-1 sm:self-center self-end shrink-0">
                      {/* Force Mute / Unmute */}
                      <button
                        onClick={() =>
                          handleParticipantAction(
                            p.identity,
                            p.isMutedByMod ? "unmute" : "mute",
                            p.isMutedByMod ? "Unmute" : "Force Mute"
                          )
                        }
                        disabled={actionLoading !== null}
                        className={`p-1.5 px-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                          p.isMutedByMod
                            ? "bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                            : "bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30"
                        }`}
                        title={p.isMutedByMod ? "Allow unmuting" : "Force mute user mic"}
                      >
                        {p.isMutedByMod ? <Mic size={13} /> : <MicOff size={13} />}
                        <span className="text-[10px] font-bold">{p.isMutedByMod ? "Unmute" : "Mute"}</span>
                      </button>

                      {/* Kick */}
                      <button
                        onClick={() =>
                          handleParticipantAction(p.identity, "kick", "Kicked")
                        }
                        disabled={actionLoading !== null}
                        className="p-1.5 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Kick from junction"
                      >
                        <UserX size={13} />
                        <span className="text-[10px] font-bold">Kick</span>
                      </button>

                      {/* Ban */}
                      <button
                        onClick={() =>
                          handleParticipantAction(p.identity, "ban", "Banned")
                        }
                        disabled={actionLoading !== null}
                        className="p-1.5 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-rose-800 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Ban from re-joining junction"
                      >
                        <Ban size={13} />
                        <span className="text-[10px] font-bold">Ban</span>
                      </button>

                      {/* Transfer Mod */}
                      <button
                        onClick={() =>
                          handleParticipantAction(p.identity, "transfer_mod", "Moderator Transferred")
                        }
                        disabled={actionLoading !== null}
                        className="p-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Transfer Moderator Role"
                      >
                        <Crown size={13} />
                        <span className="text-[10px] font-bold">Make Mod</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Room Controls & Security */}
        {activeTab === "room" && (
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 no-scrollbar">


            {/* Clear Chat Card */}
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <Trash2 size={18} />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-white">Clear Whisper Chat</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Purge in-room chat messages for all participants</div>
                </div>
              </div>

              <button
                onClick={() => {
                  onClearChat();
                  showNotice("Room chat cleared");
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>

            {/* Banned Users Summary */}
            {junction.bannedIdentities && junction.bannedIdentities.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Ban size={13} className="text-rose-400" />
                  <span>Banned Users ({junction.bannedIdentities.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {junction.bannedIdentities.map((user) => (
                    <span
                      key={user}
                      className="px-2 py-0.5 rounded-lg bg-rose-950/60 border border-rose-500/30 text-rose-300 font-mono text-[10px]"
                    >
                      {user}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* End Junction Danger Zone */}
            {currentModerator === junction.creatorId && (
              <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs mb-1">
                <AlertTriangle size={15} />
                <span>Danger Zone</span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 mb-3">
                Closing this junction will instantly disconnect all participants and delete the voice room.
              </p>

              {!confirmEnd ? (
                <button
                  onClick={() => setConfirmEnd(true)}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PhoneOff size={14} />
                  <span>End Junction for Everyone</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEndJunction}
                    disabled={actionLoading !== null}
                    className="flex-1 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Yes, Terminate Junction
                  </button>
                  <button
                    onClick={() => setConfirmEnd(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 mt-auto flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close Deck
          </button>
        </div>
      </div>
    </div>
  );
}
