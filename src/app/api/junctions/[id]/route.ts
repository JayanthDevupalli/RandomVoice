import { NextRequest, NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import {
  getJunctionById,
  addParticipantToJunction,
  removeParticipantFromJunction,
  moderateParticipant,
  claimModeratorRole,
  deleteJunction,
  updateParticipantProfile,
  reportParticipant,
  updateJunctionDetails,
  touchParticipantHeartbeat,
  toggleRoomLock,
  knockWaitingRoom,
  admitWaitingGuest,
  denyWaitingGuest,
  cancelWaitingKnock,
  getWaitingGuests,
  isIdentityAdmitted,
} from "@/lib/junctions-store";
import { generateRandomNickname } from "@/lib/guest-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSbAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return serviceKey && url
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : anonSupabase;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const identity = searchParams.get("identity") || searchParams.get("username") || "";
    const tabSessionId = searchParams.get("tabSessionId") || "";

    if (action === "leave" && identity) {
      await removeParticipantFromJunction(params.id, identity, { tabSessionId });
    } else if (identity) {
      touchParticipantHeartbeat(params.id, identity);
    }

    const junction = await getJunctionById(params.id);
    if (!junction) {
      return NextResponse.json({ error: "Junction not found or expired" }, { status: 404 });
    }
    const waitingGuests = getWaitingGuests(params.id);
    const isAdmitted = identity ? isIdentityAdmitted(params.id, identity) : false;
    return NextResponse.json(
      { junction, waitingGuests, isAdmitted },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error(`GET /api/junctions/${params.id} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch junction", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let body: any = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    } else {
      try {
        const text = await request.text();
        body = JSON.parse(text);
      } catch {
        try {
          body = await request.json();
        } catch {
          body = {};
        }
      }
    }
    const { action, participant, identity, moderatorIdentity, moderatorUserId, requesterRole, targetIdentity, modAction, isLocked, updates, tabSessionId } = body;

    if (action === "join") {
      if (!participant) {
        return NextResponse.json({ error: "Missing participant" }, { status: 400 });
      }

      // Verify authentic Supabase session token if provided
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");
      const sbAdmin = getSbAdmin();

      let authUser: any = null;
      let userProfile: any = null;

      if (token) {
        try {
          const { data: { user } } = await sbAdmin.auth.getUser(token);
          if (user?.id) {
            authUser = user;
            const { data: prof } = await sbAdmin
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            userProfile = prof;
          }
        } catch (e) {
          console.warn("Auth token check error on junction join:", e);
        }
      }

      if (authUser && userProfile) {
        // Verified registered user: enforce DB identity & user ID
        participant.id = authUser.id;
        participant.identity = userProfile.username || participant.identity;
        participant.username = userProfile.username;
        const dName = userProfile.display_name || userProfile.social_links?.display_name || userProfile.username;
        participant.name = dName;
        participant.displayName = dName;
        if (userProfile.avatar) {
          participant.avatar = userProfile.avatar;
        }
        const userDbRole = userProfile.role || userProfile.social_links?.role || "user";
        participant.userRole = userDbRole;
      } else {
        // Guest user - enforced boundaries:
        // 1. ID must be prefixed with "guest_"
        if (!participant.id || !participant.id.startsWith("guest_")) {
          participant.id = "guest_" + (participant.id || Date.now().toString());
        }
        // 2. Identity for guests MUST be unique. Use the unique participant.id
        // to prevent collisions between multiple guests who share the same display name
        participant.identity = participant.id;
        participant.username = participant.id;
        // 3. Guest can NEVER have elevated platform roles
        participant.userRole = "user";
        // 4. Ensure name is clean, preserving user's chosen display name
        if (!participant.name) {
          participant.name = generateRandomNickname();
        }
        participant.displayName = participant.name;
      }

      const result = await addParticipantToJunction(params.id, participant, tabSessionId);
      if (!result.success) {
        return NextResponse.json({ error: result.error, isLocked: (result as any).isLocked }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction });
    }

    if (action === "knock") {
      const { guest } = body;
      if (!guest || !guest.identity) {
        return NextResponse.json({ error: "Missing guest information" }, { status: 400 });
      }
      const junction = await getJunctionById(params.id);
      if (!junction) {
        return NextResponse.json({ error: "Junction not found or expired" }, { status: 404 });
      }
      if (!junction.isLocked) {
        return NextResponse.json({ status: "open", isLocked: false, junction });
      }
      const waitingGuest = {
        id: guest.id || `guest_${Date.now()}`,
        identity: guest.identity,
        name: guest.name || guest.displayName || "Friend",
        username: guest.username || guest.identity,
        avatar: guest.avatar || "zap",
        color: guest.color || "#6366F1",
        knockedAt: Date.now(),
      };
      knockWaitingRoom(params.id, waitingGuest);

      try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const sb = (serviceKey && url) ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) : anonSupabase;
        sb.channel(`room_realtime_${params.id}`).send({
          type: "broadcast",
          event: "room_updated",
          payload: {
            type: "waiting_room_knock",
            payload: { guest: waitingGuest, junctionId: params.id },
          },
        }).then();
      } catch (err) {
        console.warn("Realtime knock broadcast notice:", err);
      }

      return NextResponse.json({ status: "waiting_room", isLocked: true });
    }

    if (action === "admit") {
      const { hostIdentity, targetIdentity } = body;
      if (!targetIdentity) {
        return NextResponse.json({ error: "Missing target identity" }, { status: 400 });
      }
      const junction = await getJunctionById(params.id);
      if (!junction) {
        return NextResponse.json({ error: "Junction not found" }, { status: 404 });
      }
      const cleanHost = (junction.creatorId || junction.moderatorIdentity || "").trim().toLowerCase();
      const cleanRequester = (hostIdentity || "").trim().toLowerCase();
      const isHost = Boolean(cleanHost && cleanRequester === cleanHost);
      const isStaff = requesterRole === "super_admin" || requesterRole === "admin";
      if (!isHost && !isStaff) {
        return NextResponse.json({ error: "Unauthorized: only the host can admit guests" }, { status: 403 });
      }
      admitWaitingGuest(params.id, targetIdentity);

      try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const sb = (serviceKey && url) ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) : anonSupabase;
        sb.channel(`room_realtime_${params.id}`).send({
          type: "broadcast",
          event: "room_updated",
          payload: {
            type: "waiting_room_admitted",
            payload: { targetIdentity, junctionId: params.id },
          },
        }).then();
      } catch (err) {
        console.warn("Realtime admit broadcast notice:", err);
      }

      return NextResponse.json({ success: true, admitted: targetIdentity });
    }

    if (action === "deny") {
      const { hostIdentity, targetIdentity } = body;
      if (!targetIdentity) {
        return NextResponse.json({ error: "Missing target identity" }, { status: 400 });
      }
      const junction = await getJunctionById(params.id);
      if (!junction) {
        return NextResponse.json({ error: "Junction not found" }, { status: 404 });
      }
      const cleanHost = (junction.creatorId || junction.moderatorIdentity || "").trim().toLowerCase();
      const cleanRequester = (hostIdentity || "").trim().toLowerCase();
      const isHost = Boolean(cleanHost && cleanRequester === cleanHost);
      const isStaff = requesterRole === "super_admin" || requesterRole === "admin";
      if (!isHost && !isStaff) {
        return NextResponse.json({ error: "Unauthorized: only the host can deny guests" }, { status: 403 });
      }
      denyWaitingGuest(params.id, targetIdentity);

      try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const sb = (serviceKey && url) ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) : anonSupabase;
        sb.channel(`room_realtime_${params.id}`).send({
          type: "broadcast",
          event: "room_updated",
          payload: {
            type: "waiting_room_denied",
            payload: { targetIdentity, junctionId: params.id },
          },
        }).then();
      } catch (err) {
        console.warn("Realtime deny broadcast notice:", err);
      }

      return NextResponse.json({ success: true, denied: targetIdentity });
    }

    if (action === "cancel_knock") {
      const { identity } = body;
      if (identity) {
        cancelWaitingKnock(params.id, identity);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "leave") {
      const { identity, identities, participantId, userId } = body;
      const allIdentities: string[] = Array.from(
        new Set(
          [
            identity,
            participantId,
            userId,
            ...(Array.isArray(identities) ? identities : []),
          ].filter(Boolean)
        )
      );

      if (allIdentities.length === 0) {
        return NextResponse.json({ error: "Missing identity" }, { status: 400 });
      }
      await removeParticipantFromJunction(params.id, identity || allIdentities[0], {
        identities: allIdentities,
        participantId,
        userId,
        tabSessionId,
      });
      const junction = await getJunctionById(params.id);
      return NextResponse.json({ junction });
    }

    if (action === "moderate") {
      if (!moderatorIdentity || !targetIdentity || !modAction) {
        return NextResponse.json({ error: "Missing required moderation parameters" }, { status: 400 });
      }
      const result = await moderateParticipant(
        params.id,
        moderatorIdentity,
        targetIdentity,
        modAction,
        moderatorUserId,
        requesterRole
      );
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 403 });
      }
      return NextResponse.json({ junction: result.junction, success: true });
    }

    if (action === "update_participant") {
      if (!identity || !updates) {
        return NextResponse.json({ error: "Missing identity or updates" }, { status: 400 });
      }
      const result = await updateParticipantProfile(params.id, identity, updates);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction, success: true });
    }

    if (action === "update_details") {
      if (!moderatorIdentity || !updates) {
        return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
      }
      const result = await updateJunctionDetails(params.id, moderatorIdentity, updates);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 403 });
      }
      return NextResponse.json({ junction: result.junction, success: true });
    }

    if (action === "report") {
      const { reason } = body;
      if (!identity || !targetIdentity) {
        return NextResponse.json({ error: "Missing required parameters for reporting" }, { status: 400 });
      }
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json({ error: "A report reason is required." }, { status: 400 });
      }
      const result = await reportParticipant(params.id, identity, targetIdentity, reason.trim());
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction, banned: result.banned, success: true });
    }

    if (action === "lock") {
      let callerRole = requesterRole;
      let callerUserId = moderatorUserId;
      let effectiveIdentity = moderatorIdentity || identity || "";

      // Check Authorization header for verified platform role & identity
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        try {
          const sbAdmin = getSbAdmin();
          const { data: { user: authUser } } = await sbAdmin.auth.getUser(token);
          if (authUser) {
            callerUserId = authUser.id;
            const { data: prof } = await sbAdmin
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .maybeSingle();
            if (prof) {
              callerRole = prof.role || prof.social_links?.role || callerRole;
              effectiveIdentity = prof.username || effectiveIdentity;
            }
          }
        } catch (e) {
          console.warn("Auth check error in lock action:", e);
        }
      }

      const result = await toggleRoomLock(
        params.id,
        effectiveIdentity,
        Boolean(isLocked),
        callerRole,
        callerUserId
      );
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction, success: true });
    }

    if (action === "claim_mod") {
      return NextResponse.json({ error: "Room host role has been decommissioned." }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    let creatorId = searchParams.get("creatorId") || undefined;
    let callerRole = searchParams.get("callerRole") || undefined;

    // Check Authorization header for authenticated user verification
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const sbAdmin = getSbAdmin();
        const { data: { user } } = await sbAdmin.auth.getUser(token);
        if (user) {
          const { data: prof } = await sbAdmin
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          if (prof) {
            const rawRole = prof.role || prof.social_links?.role || "user";
            callerRole = rawRole;
            creatorId = prof.username || prof.display_name || creatorId;
          }
        }
      } catch (e) {
        console.warn("Auth check error in DELETE junction:", e);
      }
    }

    const success = await deleteJunction(params.id, creatorId, callerRole);
    if (!success) {
      return NextResponse.json(
        { error: "Unauthorized: Only Super Admin can delete public Junctions; private rooms can only be deleted by the room creator or Super Admin." },
        { status: 403 }
      );
    }
    return NextResponse.json({ success: true, message: "Junction deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
