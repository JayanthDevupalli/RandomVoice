import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/rate-limit";
import { checkBanEvasion, recordDeviceSession } from "@/lib/ban-evasion";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const ip = getClientIp(request);
    const deviceHash =
      (typeof body.deviceHash === "string" && body.deviceHash.trim()) ||
      request.headers.get("x-device-id")?.trim() ||
      null;

    let verifiedUserId: string | null = null;
    let isRegistered = Boolean(body.isRegistered);

    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const { data: { user } } = await supabaseAdmin.auth.getUser(token);
          if (user?.id) {
            verifiedUserId = user.id;
            isRegistered = true;
          }
        } catch {}
      }
    }

    const userId = verifiedUserId || (isRegistered && typeof body.userId === "string" ? body.userId : null);
    const guestId = !isRegistered && typeof body.guestId === "string" ? body.guestId : null;
    const displayName = typeof body.displayName === "string" ? body.displayName.slice(0, 64) : null;
    const currentJunctionId =
      typeof body.currentJunctionId === "string" ? body.currentJunctionId.slice(0, 128) : null;

    await recordDeviceSession({
      deviceHash,
      ip,
      userId,
      guestId,
      displayName,
      userAgent: request.headers.get("user-agent"),
      currentJunctionId,
    });

    const banCheck = await checkBanEvasion({
      deviceHash,
      ip,
      isRegistered,
    });

    return NextResponse.json({
      ok: true,
      blocked: banCheck.blocked,
      reason: banCheck.reason || null,
      matchedBy: banCheck.matchedBy || null,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Heartbeat error" }, { status: 500 });
  }
}
