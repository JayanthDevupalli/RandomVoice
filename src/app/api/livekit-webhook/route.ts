import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { removeParticipantFromJunction } from "@/lib/junctions-store";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "LiveKit not configured" }, { status: 500 });
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const body = await request.text();
    const authHeader = request.headers.get("Authorization") || "";

    let event: any;
    try {
      event = await receiver.receive(body, authHeader);
    } catch (e: any) {
      console.warn("[LiveKit Webhook] Signature verification failed:", e.message);
      return NextResponse.json({ error: "Unauthorized webhook payload" }, { status: 401 });
    }

    if (!event) {
      return NextResponse.json({ received: true });
    }

    const eventType = event.event;
    const roomName = event.room?.name;
    const participantIdentity = event.participant?.identity;

    if (eventType === "participant_left" && roomName && participantIdentity) {
      await removeParticipantFromJunction(roomName, participantIdentity);
    } else if (eventType === "room_finished" && roomName) {
      if (serviceKey && url) {
        const adminSb = createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await adminSb.from("junction_participants").delete().eq("junction_id", roomName);
        await adminSb.from("junctions").update({ current_count: 0 }).eq("id", roomName);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[LiveKit Webhook Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
