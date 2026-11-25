import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkBanEvasion, recordDeviceSession } from "@/lib/ban-evasion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface VerifiedProfile {
  id: string;
  username: string;
  userRole: string;
  isBanned: boolean;
}

async function resolveAuthenticatedProfile(request: NextRequest): Promise<{
  hasAuthHeader: boolean;
  profile: VerifiedProfile | null;
}> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { hasAuthHeader: false, profile: null };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { hasAuthHeader: false, profile: null };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { hasAuthHeader: true, profile: null };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username, role, is_banned, social_links")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return {
        hasAuthHeader: true,
        profile: {
          id: user.id,
          username: user.email?.split("@")[0] || user.id,
          userRole: "user",
          isBanned: false,
        },
      };
    }

    const resolvedRole = profile.role || profile.social_links?.role || "user";
    const resolvedBanned =
      resolvedRole === "super_admin"
        ? false
        : Boolean(profile.is_banned ?? profile.social_links?.is_banned);

    return {
      hasAuthHeader: true,
      profile: {
        id: profile.id,
        username: profile.username,
        userRole: resolvedRole,
        isBanned: resolvedBanned,
      },
    };
  } catch {
    return { hasAuthHeader: true, profile: null };
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`lk_token:${ip}`, 25, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many connection attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room")?.trim();
  const requestedUsername = searchParams.get("username")?.trim();
  const avatar = (searchParams.get("avatar") || "zap").slice(0, 256);
  const color = (searchParams.get("color") || "#6366F1").slice(0, 32);
  const cardBgColor = (searchParams.get("cardBgColor") || "#465B73").slice(0, 128);
  const displayName = (
    searchParams.get("displayName") ||
    searchParams.get("name") ||
    requestedUsername ||
    "Guest"
  ).slice(0, 64);

  if (!room || room.length > 128) {
    return NextResponse.json({ error: 'Missing or invalid "room" parameter' }, { status: 400 });
  }
  if (!requestedUsername || requestedUsername.length > 64) {
    return NextResponse.json({ error: 'Missing or invalid "username" parameter' }, { status: 400 });
  }

  const { hasAuthHeader, profile: authedProfile } = await resolveAuthenticatedProfile(request);

  if (hasAuthHeader && !authedProfile) {
    return NextResponse.json({ error: "Invalid or expired session token." }, { status: 401 });
  }

  // --- 0.5 Ban Evasion Gate (Device & IP check for both Guests and Registered users) ---
  const deviceHash =
    request.headers.get("x-device-id")?.trim() ||
    searchParams.get("deviceId")?.trim() ||
    null;

  if (authedProfile?.userRole !== "super_admin") {
    const evasionCheck = await checkBanEvasion({
      deviceHash,
      ip,
      isRegistered: Boolean(authedProfile),
    });
    if (evasionCheck.blocked) {
      return NextResponse.json(
        { error: evasionCheck.reason || "Access suspended from this device or network." },
        { status: 403 }
      );
    }
  }

  // Record/update device session with current room
  recordDeviceSession({
    deviceHash,
    ip,
    userId: authedProfile?.id || null,
    guestId: !authedProfile ? (searchParams.get("userId") || requestedUsername) : null,
    displayName,
    userAgent: request.headers.get("user-agent"),
    currentJunctionId: room.startsWith("dm_call_") ? null : room,
  }).catch(() => {});

  // --- 1. Private 1-on-1 DM Voice Call Authorization ---
  if (room.startsWith("dm_call_")) {
    if (!authedProfile) {
      return NextResponse.json(
        { error: "Authentication required for private voice calls." },
        { status: 401 }
      );
    }
    if (authedProfile.isBanned) {
      return NextResponse.json(
        { error: "Your account has been suspended by YapClub moderation." },
        { status: 403 }
      );
    }

    const conversationId = room.slice("dm_call_".length);
    const { data: membership, error: memberErr } = await supabaseAdmin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", authedProfile.id)
      .maybeSingle();

    if (memberErr || !membership) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant in this conversation." },
        { status: 403 }
      );
    }
  }

  // --- 2. Resolve Authoritative Identity & Prevent Registered User Impersonation ---
  let effectiveIdentity = requestedUsername;
  let effectiveUserId = searchParams.get("userId") || searchParams.get("id") || requestedUsername;
  let effectiveUserRole = "user";

  if (authedProfile) {
    if (authedProfile.isBanned) {
      return NextResponse.json(
        { error: "Your account has been suspended by YapClub moderation." },
        { status: 403 }
      );
    }
    effectiveIdentity = authedProfile.username || authedProfile.id;
    effectiveUserId = authedProfile.id;
    effectiveUserRole = authedProfile.userRole;
  } else {
    // Unauthenticated guest: block spoofing any registered username
    if (!requestedUsername.startsWith("guest_")) {
      const { data: existingMember } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", requestedUsername)
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json(
          { error: "This username belongs to a registered account. Please log in." },
          { status: 403 }
        );
      }
    }
  }

  // --- 3. Server-Side Room Ban & Moderator Verification ---
  let isActualModerator = false;
  if (!room.startsWith("dm_call_")) {
    const { data: junction } = await supabaseAdmin
      .from("junctions")
      .select("moderator_identity, creator_id, banned_identities")
      .eq("id", room)
      .maybeSingle();

    if (junction) {
      const callerAliases = new Set(
        [effectiveIdentity, effectiveUserId, requestedUsername]
          .filter(Boolean)
          .map((s) => s.trim().toLowerCase())
      );

      const bannedList: string[] = Array.isArray(junction.banned_identities)
        ? junction.banned_identities
        : [];
      const isRoomBanned = bannedList.some((b) => callerAliases.has(String(b).trim().toLowerCase()));
      if (isRoomBanned && effectiveUserRole !== "super_admin") {
        return NextResponse.json(
          { error: "You have been banned from this voice room." },
          { status: 403 }
        );
      }

      const modId = (junction.moderator_identity || "").trim().toLowerCase();
      const creatorId = (junction.creator_id || "").trim().toLowerCase();
      isActualModerator =
        effectiveUserRole === "super_admin" ||
        effectiveUserRole === "admin" ||
        (Boolean(modId) && callerAliases.has(modId)) ||
        (Boolean(creatorId) && callerAliases.has(creatorId));
    }
  }

  const effectiveRoomRole = isActualModerator ? "moderator" : "speaker";

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || "wss://demo.livekit.cloud";

  const isRealLiveKit = Boolean(
    apiKey && apiSecret && apiKey !== "devkey" && apiSecret !== "secret"
  );

  try {
    const metadataPayload = JSON.stringify({
      id: effectiveUserId,
      identity: effectiveIdentity,
      username: effectiveIdentity,
      displayName,
      name: displayName,
      avatar,
      color,
      cardBgColor,
      role: effectiveRoomRole,
      userRole: effectiveUserRole,
      joinedAt: Date.now(),
    });

    if (apiKey && apiSecret) {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: effectiveIdentity,
        name: displayName || undefined,
        metadata: metadataPayload,
        ttl: "4h",
      });

      at.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: isActualModerator,
      });

      const token = await at.toJwt();
      return NextResponse.json({
        token,
        serverUrl: livekitUrl,
        isConfigured: isRealLiveKit,
      });
    }

    // Fallback token generator for local dev without LiveKit keys
    return NextResponse.json({
      token: "demo_token_" + Buffer.from(`${room}:${effectiveIdentity}:${Date.now()}`).toString("base64"),
      serverUrl: livekitUrl,
      isConfigured: false,
    });
  } catch (error: any) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate voice token" },
      { status: 500 }
    );
  }
}
