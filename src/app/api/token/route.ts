import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room");
  const username = searchParams.get("username");
  const avatar = searchParams.get("avatar") || "zap";
  const color = searchParams.get("color") || "#6366F1";

  if (!room) {
    return NextResponse.json({ error: 'Missing "room" parameter' }, { status: 400 });
  }
  if (!username) {
    return NextResponse.json({ error: 'Missing "username" parameter' }, { status: 400 });
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
        name: username,
        metadata: JSON.stringify({ avatar, color, role }),
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
