import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as anonSupabase } from "@/lib/supabase";
import { UserRole } from "@/lib/types";
import { kickLiveKitParticipant } from "@/lib/livekit-server";

export const dynamic = "force-dynamic";

// Service-role Supabase client with admin bypass
function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (serviceKey && url) {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonSupabase;
}

// Helper to determine if an identity/username is Main Admin
function isMainAdmin(username?: string, role?: string): boolean {
  return role === "super_admin";
}

// Resilient profile fetcher (reads native columns with fallback to social_links JSON)
async function fetchTargetProfile(adminClient: any, targetUserId?: string, targetUsername?: string) {
  let profile = null;
  if (targetUserId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
    if (isUuid) {
      const { data } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", targetUserId)
        .maybeSingle();
      profile = data;
    }
  }

  if (!profile && targetUsername) {
    const { data } = await adminClient
      .from("profiles")
      .select("*")
      .ilike("username", targetUsername)
      .maybeSingle();
    profile = data;
  }

  if (!profile && targetUserId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    const { data } = await adminClient
      .from("profiles")
      .select("*")
      .ilike("username", targetUserId)
      .maybeSingle();
    profile = data;
  }

  if (profile) {
    const rawRole = profile.role || profile.social_links?.role || "user";
    const isMain = rawRole === "super_admin";
    const resolvedRole = isMain
      ? "super_admin"
      : rawRole;
    const resolvedBanned = isMain
      ? false
      : Boolean(profile.is_banned ?? profile.social_links?.is_banned);

    return {
      id: profile.id,
      username: profile.username,
      role: resolvedRole as UserRole,
      is_banned: resolvedBanned,
      banned_reason: profile.banned_reason || profile.social_links?.banned_reason || undefined,
      social_links: profile.social_links || {},
    };
  }

  return null;
}

// Resilient role updater (updates native column, with seamless fallback to social_links)
async function updateProfileRole(
  adminClient: any,
  target: { id?: string; username?: string },
  newRole: UserRole,
  existingLinks?: any
) {
  const isUuid = Boolean(target.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id));
  const filterVal = isUuid ? target.id! : (target.username || target.id || "");

  let currentLinks = existingLinks;
  if (!currentLinks || typeof currentLinks !== "object") {
    const { data: prof } = await (isUuid
      ? adminClient.from("profiles").select("social_links").eq("id", filterVal).maybeSingle()
      : adminClient.from("profiles").select("social_links").ilike("username", filterVal).maybeSingle());
    currentLinks = prof?.social_links || {};
  }

  const updatedLinks = { ...currentLinks, role: newRole };
  const { error } = await (isUuid
    ? adminClient.from("profiles").update({ social_links: updatedLinks }).eq("id", filterVal)
    : adminClient.from("profiles").update({ social_links: updatedLinks }).ilike("username", filterVal));

  if (error) {
    // If update failed, try with role column fallback
    await (isUuid
      ? adminClient.from("profiles").update({ role: newRole, social_links: updatedLinks }).eq("id", filterVal)
      : adminClient.from("profiles").update({ role: newRole, social_links: updatedLinks }).ilike("username", filterVal));
  }
}

// Resilient ban updater (updates native columns, with seamless fallback to social_links)
async function updateProfileBan(
  adminClient: any,
  target: { id?: string; username?: string },
  isBanned: boolean,
  bannedReason?: string
) {
  const isUuid = Boolean(target.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id));
  const filterVal = isUuid ? target.id! : (target.username || target.id || "");

  // 1. Try native columns
  const updateData: any = {
    is_banned: isBanned,
    banned_reason: isBanned ? (bannedReason || "Violation of YapClub Community Guidelines") : null,
    banned_at: isBanned ? new Date().toISOString() : null,
  };

  const { error: nativeErr } = await (isUuid
    ? adminClient.from("profiles").update(updateData).eq("id", filterVal)
    : adminClient.from("profiles").update(updateData).ilike("username", filterVal));

  // 2. If native column is missing, store in social_links JSONB
  if (nativeErr) {
    const { data: prof } = await (isUuid
      ? adminClient.from("profiles").select("social_links").eq("id", filterVal).maybeSingle()
      : adminClient.from("profiles").select("social_links").ilike("username", filterVal).maybeSingle());

    const currentLinks = (prof?.social_links && typeof prof.social_links === "object") ? prof.social_links : {};
    const { error: fallbackErr } = await (isUuid
      ? adminClient.from("profiles").update({
          social_links: {
            ...currentLinks,
            is_banned: isBanned,
            banned_reason: isBanned ? (bannedReason || "Violation of YapClub Community Guidelines") : null,
            banned_at: isBanned ? new Date().toISOString() : null,
          },
        }).eq("id", filterVal)
      : adminClient.from("profiles").update({
          social_links: {
            ...currentLinks,
            is_banned: isBanned,
            banned_reason: isBanned ? (bannedReason || "Violation of YapClub Community Guidelines") : null,
            banned_at: isBanned ? new Date().toISOString() : null,
          },
        }).ilike("username", filterVal));

    if (fallbackErr) throw fallbackErr;
  }
}

async function verifyAdminAuth(
  request: NextRequest,
  fallbackUser?: { username?: string; role?: string }
): Promise<{ authorized: boolean; role?: UserRole; username?: string }> {
  const authHeader = request.headers.get("authorization");
  const secretKey = request.headers.get("x-admin-key");

  // Allow server secret key if provided
  const expectedSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secretKey && expectedSecret && secretKey === expectedSecret) {
    return { authorized: true, role: "super_admin", username: "super_admin" };
  }

  const token =
    authHeader?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("x-supabase-token") ||
    undefined;

  const adminClient = getAdminClient();

  if (token) {
    try {
      const { data: { user: authUser }, error } = await adminClient.auth.getUser(token);
      if (!error && authUser) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        const username = profile?.username || authUser.user_metadata?.username || "";
        const dbRole = profile?.role || profile?.social_links?.role;
        if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
          return { authorized: true, role: dbRole as UserRole, username };
        }
      }
    } catch (e) {
      console.error("verifyAdminAuth token check error in admin/users:", e);
    }
  }

  return { authorized: false };
}

// GET: Fetch all users for Admin Dashboard (Staff Only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requesterUsername = searchParams.get("requesterUsername");
    const requesterRole = searchParams.get("requesterRole");

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername || undefined,
      role: requesterRole || undefined,
    });
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Staff access required" }, { status: 403 });
    }

    const adminClient = getAdminClient();

    const { data: profiles, error } = await adminClient
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin users fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalized = (profiles || []).map((p: any) => {
      const rawRole = p.role || p.social_links?.role || "user";
      const isMain = rawRole === "super_admin";
      const resolvedRole = isMain
        ? "super_admin"
        : rawRole;
      const resolvedBanned = isMain
        ? false
        : Boolean(p.is_banned ?? p.social_links?.is_banned);
      const cardBg = (p.card_bg_color && p.card_bg_color !== "#465B73")
        ? p.card_bg_color
        : (p.social_links?.card_bg_color || p.card_bg_color || "#465B73");

      return {
        id: p.id,
        username: p.username,
        displayName: p.display_name || p.social_links?.display_name || p.username,
        avatar: p.avatar,
        bio: p.bio,
        card_bg_color: cardBg,
        created_at: p.created_at,
        role: resolvedRole,
        is_banned: resolvedBanned,
        banned_reason: p.banned_reason || p.social_links?.banned_reason,
      };
    });

    return NextResponse.json({ users: normalized });
  } catch (err: any) {
    console.error("Admin users GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Update Role or Ban Status
export async function PATCH(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const {
      targetUserId,
      targetUsername,
      action,
      role,
      isBanned,
      bannedReason,
      requesterUsername,
      requesterRole,
    } = body;

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername,
      role: requesterRole,
    });
    if (!auth.authorized) {
      return NextResponse.json(
        { error: "Unauthorized: Staff access required." },
        { status: 403 }
      );
    }

    if ((!targetUserId && !targetUsername) || !action) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Determine caller clearance from verified session
    const isCallerMainAdmin = auth.role === "super_admin";
    const isCallerAdmin = isCallerMainAdmin || auth.role === "admin";
    const isCallerManager = isCallerAdmin || auth.role === "manager";

    if (!isCallerManager) {
      return NextResponse.json(
        { error: "Unauthorized: Staff access required." },
        { status: 403 }
      );
    }

    const targetProfile = await fetchTargetProfile(adminClient, targetUserId, targetUsername);

    // If target profile not found in profiles, handle guest participants gracefully
    if (!targetProfile) {
      if (action === "set_role") {
        return NextResponse.json(
          { error: `@${targetUsername || "User"} is a guest without an account. Only registered YapClub members can be appointed to staff roles.` },
          { status: 400 }
        );
      }

      if (action === "toggle_ban") {
        const guestIdentifier = targetUsername || targetUserId;
        if (guestIdentifier) {
          if (isBanned) {
            // Remove from all active junctions
            if (targetUsername) {
              await adminClient
                .from("junction_participants")
                .delete()
                .ilike("identity", targetUsername);
            }
            if (targetUserId) {
              await adminClient
                .from("junction_participants")
                .delete()
                .eq("id", targetUserId);
            }

            // Ban from all junctions
            const { data: allJuncs } = await adminClient.from("junctions").select("id, banned_identities");
            if (allJuncs) {
              for (const j of allJuncs) {
                const list = Array.isArray(j.banned_identities) ? j.banned_identities : [];
                if (!list.some((b: string) => b.toLowerCase() === guestIdentifier.toLowerCase())) {
                  await adminClient
                    .from("junctions")
                    .update({ banned_identities: [...list, guestIdentifier] })
                    .eq("id", j.id);
                }
                // Also kick from LiveKit Cloud room
                await kickLiveKitParticipant(j.id, guestIdentifier);
              }
            }

            return NextResponse.json({
              success: true,
              message: `Guest @${guestIdentifier} has been suspended and ejected from all rooms.`,
              isGuest: true,
            });
          } else {
            // Unban guest from all junctions
            const { data: allJuncs } = await adminClient.from("junctions").select("id, banned_identities");
            if (allJuncs) {
              for (const j of allJuncs) {
                const list = Array.isArray(j.banned_identities) ? j.banned_identities : [];
                const updated = list.filter((b: string) => b.toLowerCase() !== guestIdentifier.toLowerCase());
                if (updated.length !== list.length) {
                  await adminClient
                    .from("junctions")
                    .update({ banned_identities: updated })
                    .eq("id", j.id);
                }
              }
            }

            return NextResponse.json({
              success: true,
              message: `Guest @${guestIdentifier} suspension has been lifted.`,
              isGuest: true,
            });
          }
        }
      }

      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isTargetMainAdmin = targetProfile.role === "super_admin";

    // ==========================================
    // ACTION 1: Role Promotion / Demotion
    // ==========================================
    if (action === "set_role") {
      if (isTargetMainAdmin && role !== "super_admin") {
        return NextResponse.json(
          { error: "The Main Admin (jayanthadmin) cannot be demoted." },
          { status: 400 }
        );
      }

      // Hierarchy rules:
      // 1. Promoting to 'admin': ONLY Main Admin (jayanthadmin) can do this!
      if (role === "admin" && !isCallerMainAdmin) {
        return NextResponse.json(
          { error: "Strict Policy: Only the Main Admin (jayanthadmin) has the authority to appoint Admins." },
          { status: 403 }
        );
      }

      // 2. Modifying or demoting an existing Admin: ONLY Main Admin can do this!
      if (targetProfile.role === "admin" && !isCallerMainAdmin) {
        return NextResponse.json(
          { error: "Strict Policy: Only the Main Admin (jayanthadmin) can demote or change the role of an Admin." },
          { status: 403 }
        );
      }

      // 3. Promoting a user to 'manager':
      // Allowed for: Main Admin, Admins, and Managers
      if (role === "manager") {
        if (!isCallerManager) {
          return NextResponse.json({ error: "Unauthorized to appoint managers." }, { status: 403 });
        }
      }

      // 4. Demoting a 'manager' to regular 'user':
      // Main Admin and Admins can demote managers. Managers cannot demote fellow managers.
      if (role === "user" && targetProfile.role === "manager" && !isCallerAdmin) {
        return NextResponse.json(
          { error: "Admin clearance required to demote a Manager." },
          { status: 403 }
        );
      }

      const validRoles: UserRole[] = ["super_admin", "admin", "manager", "user"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
      }

      await updateProfileRole(
        adminClient,
        { id: targetProfile.id, username: targetProfile.username },
        role,
        targetProfile.social_links
      );

      // Non-blocking realtime broadcast
      try {
        const ch = adminClient.channel("user_updates_broadcast");
        ch.send({
          type: "broadcast",
          event: "profile_updated",
          payload: {
            targetUserId: targetProfile.id,
            targetUsername: targetProfile.username,
            newRole: role,
          },
        }).catch((e: any) => console.warn("Broadcast warning:", e));
      } catch (e) {
        console.warn("Failed to send broadcast in set_role", e);
      }

      return NextResponse.json({
        success: true,
        message: `Successfully updated @${targetProfile.username}'s role to ${role}`,
        role,
      });
    }

    // ==========================================
    // ACTION 2: Ban / Unban Account
    // ==========================================
    if (action === "toggle_ban") {
      if (isTargetMainAdmin) {
        return NextResponse.json(
          { error: "The Main Admin (jayanthadmin) cannot be banned." },
          { status: 400 }
        );
      }

      // Target is an Admin: ONLY Main Admin can ban/unban!
      if (targetProfile.role === "admin" && !isCallerMainAdmin) {
        return NextResponse.json(
          { error: "Strict Policy: Only the Main Admin (jayanthadmin) has authority to ban or unban Admins." },
          { status: 403 }
        );
      }

      // Target is a Manager: Main Admin and Admins can ban/unban!
      if (targetProfile.role === "manager" && !isCallerAdmin) {
        return NextResponse.json(
          { error: "Strict Policy: Admin clearance required to ban or unban a Manager." },
          { status: 403 }
        );
      }

      // Target is regular user: ONLY Main Admin and Admins can ban/unban! Managers cannot suspend users!
      if (!isCallerAdmin) {
        return NextResponse.json(
          { error: "Unauthorized: Admin privileges required to suspend accounts. Managers do not have permission to suspend users." },
          { status: 403 }
        );
      }

      await updateProfileBan(
        adminClient,
        { id: targetProfile.id, username: targetProfile.username },
        Boolean(isBanned),
        bannedReason
      );

      // If user is banned, immediately disconnect them from all active voice rooms
      if (isBanned) {
        if (targetProfile.username) {
          await adminClient
            .from("junction_participants")
            .delete()
            .ilike("identity", targetProfile.username);
        }
        if (targetUserId) {
          await adminClient
            .from("junction_participants")
            .delete()
            .eq("id", targetUserId);
        }

        await adminClient
          .from("junctions")
          .update({ moderator_identity: "" })
          .ilike("moderator_identity", targetProfile.username);

        // Keep all junction current_count values strictly accurate and ban from rooms
        const { data: allJuncs } = await adminClient.from("junctions").select("id, banned_identities");
        if (allJuncs) {
          for (const j of allJuncs) {
            const list = Array.isArray(j.banned_identities) ? j.banned_identities : [];
            if (!list.some((b: string) => b.toLowerCase() === targetProfile.username.toLowerCase())) {
              await adminClient
                .from("junctions")
                .update({ banned_identities: [...list, targetProfile.username] })
                .eq("id", j.id);
            }
            await kickLiveKitParticipant(j.id, targetProfile.username);
            const { count } = await adminClient
              .from("junction_participants")
              .select("*", { count: "exact", head: true })
              .eq("junction_id", j.id);
            await adminClient
              .from("junctions")
              .update({ current_count: count || 0 })
              .eq("id", j.id);
          }
        }
      } else {
        // Unban: remove from all junctions banned_identities
        const { data: allJuncs } = await adminClient.from("junctions").select("id, banned_identities");
        if (allJuncs) {
          for (const j of allJuncs) {
            const list = Array.isArray(j.banned_identities) ? j.banned_identities : [];
            const updated = list.filter((b: string) => b.toLowerCase() !== targetProfile.username.toLowerCase());
            if (updated.length !== list.length) {
              await adminClient
                .from("junctions")
                .update({ banned_identities: updated })
                .eq("id", j.id);
            }
          }
        }
      }

      // Non-blocking realtime broadcast
      try {
        const ch = adminClient.channel("user_updates_broadcast");
        ch.send({
          type: "broadcast",
          event: "profile_updated",
          payload: {
            targetUserId: targetProfile.id,
            targetUsername: targetProfile.username,
            isBanned,
          },
        }).catch((e: any) => console.warn("Broadcast warning:", e));
      } catch (e) {
        console.warn("Failed to send broadcast in toggle_ban", e);
      }

      return NextResponse.json({
        success: true,
        message: isBanned
          ? `User @${targetProfile.username} has been suspended.`
          : `User @${targetProfile.username} suspension has been lifted.`,
        is_banned: isBanned,
      });
    }

    // ==========================================
    // ACTION 3: Update Display Name (Shown Name)
    // ==========================================
    if (action === "update_display_name" || action === "set_display_name" || action === "set_name") {
      const newDisplayName = (body.displayName || body.display_name || body.name || "").trim();
      if (!newDisplayName) {
        return NextResponse.json({ error: "Display name cannot be empty" }, { status: 400 });
      }

      // Main Admin / Admins can change anyone's display name.
      // Users can change their own display name.
      const callerUsername = auth.username || requesterUsername || "";
      const isCallerSelf = callerUsername.toLowerCase() === (targetProfile.username || "").toLowerCase();
      if (!isCallerAdmin && !isCallerSelf) {
        return NextResponse.json({ error: "Unauthorized: Admin privileges or self-ownership required to update display name" }, { status: 403 });
      }

      const currentLinks = targetProfile.social_links || {};
      const updatedLinks = { ...currentLinks, display_name: newDisplayName };

      const isTargetUuid = Boolean(targetProfile.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProfile.id));
      const filterVal = isTargetUuid ? targetProfile.id : targetProfile.username;

      const { error: updateErr } = await (isTargetUuid
        ? adminClient.from("profiles").update({ social_links: updatedLinks, display_name: newDisplayName }).eq("id", filterVal)
        : adminClient.from("profiles").update({ social_links: updatedLinks, display_name: newDisplayName }).ilike("username", filterVal));

      if (updateErr) {
        await (isTargetUuid
          ? adminClient.from("profiles").update({ social_links: updatedLinks }).eq("id", filterVal)
          : adminClient.from("profiles").update({ social_links: updatedLinks }).ilike("username", filterVal));
      }

      // Non-blocking broadcast
      try {
        const ch = adminClient.channel("user_updates_broadcast");
        ch.send({
          type: "broadcast",
          event: "profile_updated",
          payload: {
            targetUserId: targetProfile.id,
            targetUsername: targetProfile.username,
            displayName: newDisplayName,
          },
        }).catch(() => {});
      } catch (e) {}

      return NextResponse.json({
        success: true,
        message: `Successfully updated @${targetProfile.username}'s shown name to "${newDisplayName}"`,
        displayName: newDisplayName,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Admin users PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Permanent Account Removal
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("targetUserId");
    const targetUsername = searchParams.get("targetUsername");
    const requesterUsername = searchParams.get("requesterUsername");
    const requesterRole = searchParams.get("requesterRole");

    if (!targetUserId && !targetUsername) {
      return NextResponse.json({ error: "Missing target user parameter" }, { status: 400 });
    }

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername || undefined,
      role: requesterRole || undefined,
    });

    const isCallerMainAdmin = auth.authorized && auth.role === "super_admin";
    const isCallerAdmin =
      isCallerMainAdmin ||
      (auth.authorized && auth.role === "admin");

    if (!isCallerAdmin) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required to delete accounts." }, { status: 403 });
    }

    const adminClient = getAdminClient();
    const targetProfile = await fetchTargetProfile(adminClient, targetUserId || undefined, targetUsername || undefined);

    if (!targetProfile) {
      const isTargetUuid = Boolean(targetUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId));
      if (isTargetUuid && targetUserId) {
        try {
          await adminClient.auth.admin.deleteUser(targetUserId);
          return NextResponse.json({ success: true, message: "User cleaned up from auth." });
        } catch (authErr) {
          // ignore
        }
      }

      if (targetUserId || targetUsername) {
        if (targetUsername) {
          await adminClient.from("junction_participants").delete().ilike("identity", targetUsername);
        }
        if (targetUserId) {
          await adminClient.from("junction_participants").delete().eq("id", targetUserId);
        }
        return NextResponse.json({ success: true, message: "Participant removed." });
      }

      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetProfile.role === "super_admin") {
      return NextResponse.json({ error: "The Main Admin (jayanthadmin) cannot be deleted." }, { status: 400 });
    }

    // Only Main Admin can delete an Admin or Manager account!
    if (!isCallerMainAdmin && (targetProfile.role === "admin" || targetProfile.role === "manager")) {
      return NextResponse.json(
        { error: "Strict Policy: Only the Main Admin can delete Admin or Manager accounts." },
        { status: 403 }
      );
    }

    // 1. Remove from active voice rooms
    if (targetProfile.username) {
      await adminClient
        .from("junction_participants")
        .delete()
        .ilike("identity", targetProfile.username);
    }
    if (targetUserId) {
      await adminClient
        .from("junction_participants")
        .delete()
        .eq("id", targetUserId);
    }

    // 2. Remove rooms created by this user
    await adminClient
      .from("junctions")
      .delete()
      .or(`creator_id.ilike.${targetProfile.username},creator_id.eq.${targetProfile.id}`);

    // 3. Remove connections & blocks
    const isProfileUuid = Boolean(targetProfile.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProfile.id));
    if (isProfileUuid) {
      await adminClient
        .from("connections")
        .delete()
        .or(`requester_id.eq.${targetProfile.id},receiver_id.eq.${targetProfile.id}`);

      // 4. Remove conversation memberships
      await adminClient
        .from("conversation_members")
        .delete()
        .eq("user_id", targetProfile.id);

      // 5. Delete profile record
      const { error: profileError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetProfile.id);

      if (profileError) {
        console.error("Profile deletion error:", profileError);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }

      // 6. Delete from Supabase Auth permanently
      try {
        await adminClient.auth.admin.deleteUser(targetProfile.id);
      } catch (authErr) {
        console.warn("Auth admin user delete warning:", authErr);
      }
    } else {
      await adminClient
        .from("profiles")
        .delete()
        .ilike("username", targetProfile.username);
    }

    return NextResponse.json({
      success: true,
      message: `User @${targetProfile.username} has been permanently deleted.`,
    });
  } catch (err: any) {
    console.error("Admin user DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
