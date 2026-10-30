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
} from "@/lib/junctions-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const identity = searchParams.get("identity") || searchParams.get("username") || "";

    if (action === "leave" && identity) {
      await removeParticipantFromJunction(params.id, identity);
    }

    const junction = await getJunctionById(params.id);
    if (!junction) {
      return NextResponse.json({ error: "Junction not found" }, { status: 404 });
    }
    return NextResponse.json(
      { junction },
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
    const { action, participant, identity, moderatorIdentity, moderatorUserId, requesterRole, targetIdentity, modAction, isLocked, updates } = body;

    if (action === "join") {
      if (!participant) {
        return NextResponse.json({ error: "Missing participant" }, { status: 400 });
      }

      // Verify authentic Supabase session token if provided
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const sbAdmin = (serviceKey && url)
        ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
        : anonSupabase;

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
        // 2. Guest can NEVER have elevated platform roles
        participant.userRole = "user";
        // 3. Prevent guest from spoofing a registered user's username
        if (participant.identity) {
          const cleanIdent = participant.identity.trim().toLowerCase();
          const { data: existingUser } = await sbAdmin
            .from("profiles")
            .select("id")
            .ilike("username", cleanIdent)
            .maybeSingle();
          if (existingUser) {
            // A registered user owns this handle. Append a random suffix so guest doesn't impersonate them
            participant.identity = `${participant.identity}_guest`;
            participant.username = participant.identity;
          }
        }
      }

      const result = await addParticipantToJunction(params.id, participant);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction });
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
      const result = await toggleRoomLock(params.id, moderatorIdentity || identity || "", Boolean(isLocked));
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
    const creatorId = searchParams.get("creatorId") || undefined;
    const callerRole = searchParams.get("callerRole") || undefined;

    const success = await deleteJunction(params.id, creatorId, callerRole);
    if (!success) {
      return NextResponse.json({ error: "Junction not found or unauthorized" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Junction deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
