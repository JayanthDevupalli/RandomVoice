"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { X, UserPlus, ShieldAlert, Loader2, Check, MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { JunctionParticipant } from "@/lib/types";
import { useRouter } from "next/navigation";

interface ProfilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: JunctionParticipant | null;
}

export function ProfilePreviewModal({ isOpen, onClose, participant }: ProfilePreviewModalProps) {
  const router = useRouter();
  const { user: currentUser, isRegistered } = useUser();
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"none" | "pending" | "accepted">("none");
  const [isRequesting, setIsRequesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !participant) return;

    async function fetchDetails() {
      setIsLoading(true);
      
      // 1. Check if the participant is a registered user by looking up their username
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", participant?.identity)
        .single();

      if (profileData) {
        setProfile(profileData);
        
        // 2. If we are logged in, check connection status
        if (isRegistered && currentUser) {
          const { data: connData, error } = await supabase
            .from("connections")
            .select("*")
            .in("requester_id", [currentUser.id, profileData.id])
            .in("receiver_id", [currentUser.id, profileData.id])
            .maybeSingle();

          if (error) console.error("Error fetching connection status:", error);
            
          if (connData) {
            setConnectionStatus(connData.status as "pending" | "accepted");
          } else {
            setConnectionStatus("none");
          }
        }
      } else {
        setProfile(null);
      }
      
      setIsLoading(false);
    }

    fetchDetails();
  }, [isOpen, participant, currentUser, isRegistered]);

  const handleFollowRequest = async () => {
    if (!isRegistered || !currentUser || !profile) {
      alert("You need to log in to connect with users!");
      return;
    }
    
    setIsRequesting(true);
    
    try {
      const { error } = await supabase
        .from("connections")
        .insert({
          requester_id: currentUser.id,
          receiver_id: profile.id,
          status: "pending"
        });
        
      if (error) {
        if (error.code === '23505') {
          // Already requested
          setConnectionStatus("pending");
        } else {
          throw error;
        }
      } else {
        setConnectionStatus("pending");
      }
    } catch (err: any) {
      alert("Failed to send request. Try again.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleViewFullProfile = () => {
    onClose();
    if (profile) {
      router.push(`/profile/${profile.id}`);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && participant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm bg-[#12131A] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center"
          >
            {/* Header / Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            {isLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : profile ? (
              // Registered User View
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#12131A] shadow-xl bg-indigo-900/50 mb-4 cursor-pointer hover:scale-105 transition-transform" onClick={handleViewFullProfile}>
                  {profile.avatar.includes("http") ? (
                    <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover" />
                  ) : (
                    <UserAvatar avatar={profile.avatar} color="#6366F1" size="lg" className="!rounded-full !w-full !h-full" />
                  )}
                </div>
                
                <h3 className="text-xl font-bold text-white mb-1">{profile.username}</h3>
                
                <p className="text-sm text-slate-400 line-clamp-2 mb-6 px-4">
                  {profile.bio || "No bio yet."}
                </p>

                {/* Interaction Button */}
                {currentUser?.id !== profile.id && (
                  <div className="w-full">
                    {connectionStatus === "accepted" ? (
                      <div className="flex gap-2 w-full">
                        <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-medium text-sm border border-emerald-500/30 cursor-default">
                          <Check size={16} />
                          Friends
                        </button>
                        <button 
                          onClick={async () => {
                            if (!currentUser) return;
                            setIsRequesting(true);
                            try {
                              const { data: myConvs } = await supabase
                                .from('conversation_members')
                                .select('conversation_id, conversations!inner(type)')
                                .eq('user_id', currentUser.id)
                                .eq('conversations.type', 'direct');

                              let existingConvId = null;

                              if (myConvs && myConvs.length > 0) {
                                const convIds = myConvs.map((c: any) => c.conversation_id);
                                const { data: shared } = await supabase
                                  .from('conversation_members')
                                  .select('conversation_id')
                                  .eq('user_id', profile.id)
                                  .in('conversation_id', convIds);
                                  
                                if (shared && shared.length > 0) {
                                  existingConvId = shared[0].conversation_id;
                                }
                              }

                              if (!existingConvId) {
                                const { data: newConv } = await supabase
                                  .from('conversations')
                                  .insert({ type: 'direct' })
                                  .select('id')
                                  .single();
                                  
                                if (newConv) {
                                  await supabase.from('conversation_members').insert([
                                    { conversation_id: newConv.id, user_id: currentUser.id },
                                    { conversation_id: newConv.id, user_id: profile.id }
                                  ]);
                                  existingConvId = newConv.id;
                                }
                              }

                              window.location.href = '/messages';
                            } catch (e) {
                              console.error(e);
                            }
                            setIsRequesting(false);
                          }}
                          disabled={isRequesting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg"
                        >
                          {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                          Message
                        </button>
                      </div>
                    ) : connectionStatus === "pending" ? (
                      <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm border border-white/5 cursor-default">
                        Request Sent
                      </button>
                    ) : (
                      <button 
                        onClick={handleFollowRequest}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20"
                      >
                        {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                        Request to Follow
                      </button>
                    )}
                  </div>
                )}
                
                <button 
                  onClick={handleViewFullProfile}
                  className="mt-4 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  View Full Profile
                </button>
              </div>
            ) : (
              // Guest User View
              <div className="flex flex-col items-center py-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#12131A] shadow-xl bg-slate-800 mb-4">
                  <UserAvatar avatar={participant.avatar} color={participant.color} size="lg" className="!rounded-full !w-full !h-full" />
                </div>
                
                <h3 className="text-xl font-bold text-white mb-1">{participant.name}</h3>
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">
                  Guest User
                </span>
                
                <p className="text-sm text-slate-500 max-w-[200px] mb-4">
                  This user hasn't created a YapClub account yet.
                </p>

                {!isRegistered && (
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                    Sign up to build your profile and connect with others!
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
