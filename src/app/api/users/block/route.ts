import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /api/users/block?userId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const [blockedByMeRes, blockedMeRes] = await Promise.all([
      supabaseAdmin
        .from("connections")
        .select("receiver_id")
        .eq("requester_id", userId)
        .eq("status", "blocked"),
      supabaseAdmin
        .from("connections")
        .select("requester_id")
        .eq("receiver_id", userId)
        .eq("status", "blocked"),
    ]);

    const blockedByMeIds = (blockedByMeRes.data || []).map((r) => r.receiver_id);
    const blockedMeIds = (blockedMeRes.data || []).map((r) => r.requester_id);

    return NextResponse.json(
      { blockedByMeIds, blockedMeIds },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/users/block exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/users/block
// Body: { userId: string, targetUserId: string, action: "block" | "unblock" }
export async function POST(request: NextRequest) {
  try {
    const { userId, targetUserId, action } = await request.json();
    if (!userId || !targetUserId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (action === "block") {
      // 1. Remove any existing connection relations in both directions
      await Promise.all([
        supabaseAdmin
          .from("connections")
          .delete()
          .eq("requester_id", userId)
          .eq("receiver_id", targetUserId),
        supabaseAdmin
          .from("connections")
          .delete()
          .eq("requester_id", targetUserId)
          .eq("receiver_id", userId),
      ]);

      // 2. Insert the block record
      const { error } = await supabaseAdmin
        .from("connections")
        .insert({
          requester_id: userId,
          receiver_id: targetUserId,
          status: "blocked",
        });

      if (error) {
        console.error("Error inserting block in connections:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isBlocked: true });
    } else {
      // Unblock: remove block record
      const { error } = await supabaseAdmin
        .from("connections")
        .delete()
        .eq("requester_id", userId)
        .eq("receiver_id", targetUserId)
        .eq("status", "blocked");

      if (error) {
        console.error("Error removing block record:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isBlocked: false });
    }
  } catch (error: any) {
    console.error("POST /api/users/block exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

