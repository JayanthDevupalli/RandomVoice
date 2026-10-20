import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

async function isUserSuspended(identifier: string): Promise<boolean> {
  if (!identifier) return false;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://pyxaklzbhymupsbconqh.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let query = adminClient.from("profiles").select("*");
    if (isUUID(identifier)) {
      query = query.or(`id.eq.${identifier},username.ilike.${identifier}`);
    } else {
      query = query.ilike("username", identifier);
    }
    const { data: profile } = await query.maybeSingle();
    if (profile) {
      return Boolean((profile as any).is_banned ?? profile.social_links?.is_banned);
    }
  } catch (e) {
    console.error("Error in isUserSuspended:", e);
  }
  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar") || "zap";
  const color = searchParams.get("color") || "#6366F1";
  const displayName = searchParams.get("displayName") || searchParams.get("name") || username || "Guest";

  if (!room) {
    return NextResponse.json({ error: 'Missing "room" parameter' }, { status: 400 });
  }
  if (!username) {
    return NextResponse.json({ error: 'Missing "username" parameter' }, { status: 400 });
  }

  // Reject suspended users immediately from acquiring voice credentials
  if (await isUserSuspended(username)) {
    return NextResponse.json(
      { error: "Your account has been suspended by YapClub moderation." },
      { status: 403 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || "wss://demo.livekit.cloud";

  const role = searchParams.get("role") || "speaker";
  const isModerator = role === "moderator";

  // Check if real LiveKit Cloud / Server keys are configured
  const isRealLiveKit = apiKey && apiSecret && apiKey !== "devkey" && apiSecret !== "secret";

  try {
    if (apiKey && apiSecret) {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: username,
        name: displayName || undefined,
        metadata: JSON.stringify({ avatar, color, role, displayName }),
        ttl: "4h",
      });

      at.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: isModerator,
      });

      const token = await at.toJwt();
      return NextResponse.json({
        token,
        serverUrl: livekitUrl,
        isConfigured: isRealLiveKit,
      });
    }

    // Fallback token generator for instant test mode
    return NextResponse.json({
      token: "demo_token_" + Buffer.from(`${room}:${username}:${Date.now()}`).toString("base64"),
      serverUrl: livekitUrl,
      isConfigured: false,
    });
  } catch (error: any) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate voice token", details: error.message },
      { status: 500 }
    );
  }
}
