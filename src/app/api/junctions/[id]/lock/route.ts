import { NextRequest, NextResponse } from "next/server";
import { toggleRoomLock } from "@/lib/junctions-store";
import { createClient } from "@supabase/supabase-js";

const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { moderatorIdentity, isLocked, requesterRole, moderatorUserId } = body;

    if (typeof isLocked !== "boolean") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let callerRole = requesterRole;
    let callerUserId = moderatorUserId;
    let effectiveIdentity = moderatorIdentity || "";

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const { data: { user } } = await sbAdmin.auth.getUser(token);
        if (user) {
          callerUserId = user.id;
          const { data: prof } = await sbAdmin
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          if (prof) {
            callerRole = prof.role || prof.social_links?.role || callerRole;
            effectiveIdentity = prof.username || effectiveIdentity;
          }
        }
      } catch (e) {
        console.warn("Auth check error in POST /api/junctions/[id]/lock:", e);
      }
    }

    const result = await toggleRoomLock(
      params.id,
      effectiveIdentity,
      isLocked,
      callerRole,
      callerUserId
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ success: true, junction: result.junction });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
