import { supabase } from "@/lib/supabase";

export interface RelationshipStatus {
  isFollowing: boolean;
  followsMe: boolean;
  hasPendingRequestFromMe: boolean;
  hasPendingRequestFromThem: boolean;
  incomingRequestId?: string;
  outgoingRequestId?: string;
  isAcceptedConnection: boolean;
  isBlockedByMe: boolean;
  hasBlockedMe: boolean;
}

export interface FollowCounts {
  followersCount: number;
  followingCount: number;
}

export interface ConnectionUser {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  connectionId?: string;
}

/**
 * Social Service — Request & Acceptance Social Graph for YAPCLUB / RandomVoice
 * Handles: Follow Request (Pending), Accept Request, Decline Request, Cancel Request,
 * Unfollow, Remove Follower, Block, Unblock, and Count Synchronization
 */
export const socialService = {
  /**
   * Check bidirectional relationship between two users
   */
  async getRelationship(currentUserId: string, targetUserId: string): Promise<RelationshipStatus> {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
      return {
        isFollowing: false,
        followsMe: false,
        hasPendingRequestFromMe: false,
        hasPendingRequestFromThem: false,
        isAcceptedConnection: false,
        isBlockedByMe: false,
        hasBlockedMe: false,
      };
    }

    try {
      const { data, error } = await supabase
        .from("connections")
        .select("id, requester_id, receiver_id, status")
        .or(
          `and(requester_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`
        );

      if (error) {
        console.error("Error fetching relationship:", error);
        return {
          isFollowing: false,
          followsMe: false,
          hasPendingRequestFromMe: false,
          hasPendingRequestFromThem: false,
          isAcceptedConnection: false,
          isBlockedByMe: false,
          hasBlockedMe: false,
        };
      }

      const rows = data || [];

      const isBlockedByMe = rows.some(
        (r) => r.requester_id === currentUserId && r.receiver_id === targetUserId && r.status === "blocked"
      );
      const hasBlockedMe = rows.some(
        (r) => r.requester_id === targetUserId && r.receiver_id === currentUserId && r.status === "blocked"
      );
      const isFollowing = rows.some(
        (r) => r.requester_id === currentUserId && r.receiver_id === targetUserId && r.status === "accepted"
      );
      const followsMe = rows.some(
        (r) => r.requester_id === targetUserId && r.receiver_id === currentUserId && r.status === "accepted"
      );
      const outgoingPendingRow = rows.find(
        (r) => r.requester_id === currentUserId && r.receiver_id === targetUserId && r.status === "pending"
      );
      const incomingPendingRow = rows.find(
        (r) => r.requester_id === targetUserId && r.receiver_id === currentUserId && r.status === "pending"
      );

      const hasPendingRequestFromMe = Boolean(outgoingPendingRow);
      const hasPendingRequestFromThem = Boolean(incomingPendingRow);
      const isAcceptedConnection = isFollowing || followsMe;

      return {
        isFollowing,
        followsMe,
        hasPendingRequestFromMe,
        hasPendingRequestFromThem,
        outgoingRequestId: outgoingPendingRow?.id,
        incomingRequestId: incomingPendingRow?.id,
        isAcceptedConnection,
        isBlockedByMe,
        hasBlockedMe,
      };
    } catch (err) {
      console.error("Failed to check relationship:", err);
      return {
        isFollowing: false,
        followsMe: false,
        hasPendingRequestFromMe: false,
        hasPendingRequestFromThem: false,
        isAcceptedConnection: false,
        isBlockedByMe: false,
        hasBlockedMe: false,
      };
    }
  },

  /**
   * Get accurate follower and following counts for any user (strictly accepted rows)
   */
  async getFollowCounts(userId: string): Promise<FollowCounts> {
    if (!userId) return { followersCount: 0, followingCount: 0 };

    try {
      const [followersRes, followingRes] = await Promise.all([
        supabase
          .from("connections")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", userId)
          .eq("status", "accepted"),
        supabase
          .from("connections")
          .select("*", { count: "exact", head: true })
          .eq("requester_id", userId)
          .eq("status", "accepted"),
      ]);

      return {
        followersCount: followersRes.count ?? 0,
        followingCount: followingRes.count ?? 0,
      };
    } catch (err) {
      console.error("Error fetching follow counts:", err);
      return { followersCount: 0, followingCount: 0 };
    }
  },

  /**
   * Send a follow request (status: 'pending')
   */
  async followUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
      return { success: false, error: "Invalid user parameters" };
    }

    // 1. Guard against blocked relations
    const rel = await this.getRelationship(currentUserId, targetUserId);
    if (rel.hasBlockedMe) {
      return { success: false, error: "You cannot follow this user." };
    }
    if (rel.isBlockedByMe) {
      return { success: false, error: "You must unblock this user before following them." };
    }

    try {
      // 2. Delete any lingering non-accepted rows to avoid unique constraint collisions
      await supabase
        .from("connections")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("receiver_id", targetUserId);

      // If target user already follows current user (or sent an accepted connection),
      // following back should immediately be 'accepted' instead of 'pending'!
      const newStatus = rel.followsMe ? "accepted" : "pending";

      // 3. Insert pending or accepted follow
      const { error } = await supabase.from("connections").insert({
        requester_id: currentUserId,
        receiver_id: targetUserId,
        status: newStatus,
      });

      if (error) {
        console.error("Error sending follow request:", error);
        return { success: false, error: error.message };
      }

      // If immediately accepted, pre-seed direct conversation
      if (newStatus === "accepted") {
        await this.ensureDirectConversation(currentUserId, targetUserId);
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception sending follow request:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Automatically ensure a direct conversation exists for the connected pair and return conversation ID
   */
  async ensureDirectConversation(userId1: string, userId2: string): Promise<string | null> {
    if (!userId1 || !userId2 || userId1 === userId2) return null;

    try {
      const { data: myConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(type)")
        .eq("user_id", userId1)
        .eq("conversations.type", "direct");

      let existingConvId: string | null = null;
      if (myConvs && myConvs.length > 0) {
        const convIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", userId2)
          .in("conversation_id", convIds);

        if (shared && shared.length > 0) {
          existingConvId = shared[0].conversation_id;
        }
      }

      if (!existingConvId) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ type: "direct" })
          .select("id")
          .single();

        if (newConv) {
          await supabase.from("conversation_members").insert([
            { conversation_id: newConv.id, user_id: userId1, role: "member" },
            { conversation_id: newConv.id, user_id: userId2, role: "member" },
          ]);
          existingConvId = newConv.id;
        }
      }

      return existingConvId;
    } catch (convErr) {
      console.warn("Non-fatal: could not ensure conversation:", convErr);
      return null;
    }
  },

  /**
   * Cancel an outgoing follow request that is still pending
   */
  async cancelFollowRequest(currentUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !targetUserId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("receiver_id", targetUserId)
        .eq("status", "pending");

      if (error) {
        console.error("Error cancelling follow request:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception cancelling follow request:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Accept an incoming follow request (changes status from 'pending' to 'accepted' and establishes mutual connection)
   */
  async acceptFollowRequest(currentUserId: string, requesterId: string, connectionId?: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !requesterId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      let query = supabase.from("connections").update({ status: "accepted" });
      if (connectionId) {
        query = query.eq("id", connectionId);
      } else {
        query = query
          .eq("requester_id", requesterId)
          .eq("receiver_id", currentUserId)
          .eq("status", "pending");
      }

      const { error } = await query;

      if (error) {
        console.error("Error accepting follow request:", error);
        return { success: false, error: error.message };
      }

      // Automatically ensure mutual connection upon acceptance so both users are connected
      try {
        await supabase.from("connections").upsert(
          {
            requester_id: currentUserId,
            receiver_id: requesterId,
            status: "accepted",
          },
          { onConflict: "requester_id,receiver_id" }
        );
      } catch (revErr) {
        console.warn("Could not create reverse connection row:", revErr);
      }

      // Automatically ensure a direct conversation exists for the newly connected pair
      await this.ensureDirectConversation(currentUserId, requesterId);

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception accepting follow request:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Decline an incoming follow request (deletes the pending connection row)
   */
  async declineFollowRequest(currentUserId: string, requesterId: string, connectionId?: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !requesterId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      let query = supabase.from("connections").delete();
      if (connectionId) {
        query = query.eq("id", connectionId);
      } else {
        query = query
          .eq("requester_id", requesterId)
          .eq("receiver_id", currentUserId)
          .eq("status", "pending");
      }

      const { error } = await query;

      if (error) {
        console.error("Error declining follow request:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception declining follow request:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Unfollow a user
   */
  async unfollowUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !targetUserId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("receiver_id", targetUserId);

      if (error) {
        console.error("Error unfollowing user:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception unfollowing user:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Remove a follower from your profile (Remove Follower)
   */
  async removeFollower(currentUserId: string, followerId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !followerId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("requester_id", followerId)
        .eq("receiver_id", currentUserId);

      if (error) {
        console.error("Error removing follower:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception removing follower:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Block a user (Instagram Architecture)
   * 1. Remove current user from following target user
   * 2. Remove target user from following current user
   * 3. Insert/upsert block row: { requester_id: currentUserId, receiver_id: targetUserId, status: 'blocked' }
   */
  async blockUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      // Step A: Sever mutual follow relations
      await Promise.all([
        supabase
          .from("connections")
          .delete()
          .eq("requester_id", currentUserId)
          .eq("receiver_id", targetUserId),
        supabase
          .from("connections")
          .delete()
          .eq("requester_id", targetUserId)
          .eq("receiver_id", currentUserId),
      ]);

      // Step B: Insert block connection record
      const { error } = await supabase.from("connections").upsert(
        {
          requester_id: currentUserId,
          receiver_id: targetUserId,
          status: "blocked",
        },
        { onConflict: "requester_id,receiver_id" }
      );

      if (error) {
        console.error("Error creating block record:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception blocking user:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Unblock a user (Instagram Architecture)
   * Permanently deletes the block record. Does NOT automatically follow them.
   */
  async unblockUser(currentUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!currentUserId || !targetUserId) {
      return { success: false, error: "Invalid user parameters" };
    }

    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("receiver_id", targetUserId)
        .eq("status", "blocked");

      if (error) {
        console.error("Error unblocking user:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception unblocking user:", err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Get all block relations for a user:
   * - blockedByMeIds: users that current user has blocked
   * - blockedMeIds: users that have blocked current user
   */
  async getBlockLists(currentUserId: string): Promise<{ blockedByMeIds: string[]; blockedMeIds: string[] }> {
    if (!currentUserId) return { blockedByMeIds: [], blockedMeIds: [] };

    try {
      const [blockedByMeRes, blockedMeRes] = await Promise.all([
        supabase
          .from("connections")
          .select("receiver_id")
          .eq("requester_id", currentUserId)
          .eq("status", "blocked"),
        supabase
          .from("connections")
          .select("requester_id")
          .eq("receiver_id", currentUserId)
          .eq("status", "blocked"),
      ]);

      const blockedByMeIds = (blockedByMeRes.data || []).map((d: any) => d.receiver_id);
      const blockedMeIds = (blockedMeRes.data || []).map((d: any) => d.requester_id);

      return {
        blockedByMeIds,
        blockedMeIds,
      };
    } catch (err) {
      console.error("Error fetching block lists:", err);
      return { blockedByMeIds: [], blockedMeIds: [] };
    }
  },

  /**
   * Get all pending incoming follow requests for current user
   */
  async getPendingIncomingRequests(currentUserId: string): Promise<any[]> {
    if (!currentUserId) return [];

    try {
      const { data, error } = await supabase
        .from("connections")
        .select(`
          id,
          created_at,
          requester:profiles!connections_requester_id_fkey (
            id,
            username,
            avatar,
            bio
          )
        `)
        .eq("receiver_id", currentUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching pending requests:", error);
        return [];
      }

      return (data || []).map((r: any) => {
        const reqProf = Array.isArray(r.requester) ? r.requester[0] : r.requester;
        return {
          id: r.id,
          created_at: r.created_at,
          requester: reqProf,
        };
      });
    } catch (err) {
      console.error("Failed to load incoming requests:", err);
      return [];
    }
  },

  /**
   * Helper to broadcast a local window event so all open views (profile, modal, messages) sync instantly
   */
  broadcastSocialUpdate() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("yapclub_social_updated"));
    }
  },
};
