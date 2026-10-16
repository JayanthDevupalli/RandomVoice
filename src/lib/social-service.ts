import { supabase } from "@/lib/supabase";

export interface RelationshipStatus {
  isFollowing: boolean;
  followsMe: boolean;
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
 * Social Service — Instagram-style Architecture for YAPCLUB / RandomVoice
 * Handles: Follow, Unfollow, Remove Follower, Block, Unblock, and Count Synchronization
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

      return {
        isFollowing,
        followsMe,
        isBlockedByMe,
        hasBlockedMe,
      };
    } catch (err) {
      console.error("Failed to check relationship:", err);
      return {
        isFollowing: false,
        followsMe: false,
        isBlockedByMe: false,
        hasBlockedMe: false,
      };
    }
  },

  /**
   * Get accurate follower and following counts for any user
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
   * Follow a user (Instagram immediate follow)
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

      // 3. Insert accepted follow
      const { error } = await supabase.from("connections").insert({
        requester_id: currentUserId,
        receiver_id: targetUserId,
        status: "accepted",
      });

      if (error) {
        console.error("Error following user:", error);
        return { success: false, error: error.message };
      }

      this.broadcastSocialUpdate();
      return { success: true };
    } catch (err: any) {
      console.error("Exception following user:", err);
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
   * Helper to broadcast a local window event so all open views (profile, modal, messages) sync instantly
   */
  broadcastSocialUpdate() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("yapclub_social_updated"));
    }
  },
};
