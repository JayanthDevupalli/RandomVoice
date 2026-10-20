import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as anonSupabase } from "@/lib/supabase";
import { getAllJunctions, deleteJunction } from "@/lib/junctions-store";

export const dynamic = "force-dynamic";

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

async function verifyAdminAuth(request: NextRequest): Promise<{ authorized: boolean; role?: string; username?: string }> {
  const authHeader = request.headers.get("authorization");
  const secretKey = request.headers.get("x-admin-key");

  // Allow server secret key if provided
  const expectedSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secretKey && expectedSecret && secretKey === expectedSecret) {
    return { authorized: true, role: "super_admin", username: "super_admin" };
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return { authorized: false };
  }

  try {
    const adminClient = getAdminClient();
    const { data: { user: authUser }, error } = await adminClient.auth.getUser(token);
    if (error || !authUser) {
      return { authorized: false };
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    const username = profile?.username || authUser.user_metadata?.username || "";
    const cleanName = username.trim().toLowerCase();
    if (cleanName === "jayanthadmin" || cleanName === "jayanth") {
      return { authorized: true, role: "super_admin", username };
    }

    const dbRole = profile?.role || profile?.social_links?.role;
    if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
      return { authorized: true, role: dbRole, username };
    }
  } catch (e) {
    console.error("verifyAdminAuth error:", e);
  }

  return { authorized: false };
}

// GET: Fetch all rooms including private / password-locked rooms (Staff only)
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required" }, { status: 403 });
    }

    const junctions = await getAllJunctions();
    return NextResponse.json({ rooms: junctions });
  } catch (err: any) {
    console.error("Admin rooms GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Force delete any room (Admin & Super Admin authority)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || (auth.role !== "super_admin" && auth.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required to force delete rooms" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const junctionId = searchParams.get("junctionId");

    if (!junctionId) {
      return NextResponse.json({ error: "Missing junctionId parameter" }, { status: 400 });
    }

    let success = await deleteJunction(junctionId, auth.username, auth.role);
    if (!success) {
      // Fallback with service role key if RLS blocks anonymous deletion
      const adminClient = getAdminClient();
      await adminClient.from("junction_participants").delete().eq("junction_id", junctionId);
      const { error } = await adminClient.from("junctions").delete().eq("id", junctionId);
      success = !error;
    }

    if (!success) {
      return NextResponse.json({ error: "Room could not be found or failed to delete" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Room deleted successfully by Administrator authority.",
    });
  } catch (err: any) {
    console.error("Admin room DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
