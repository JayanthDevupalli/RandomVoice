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

function isMainAdmin(username?: string): boolean {
  if (!username) return false;
  const clean = username.trim().toLowerCase();
  return clean === "jayanthadmin" || clean === "jayanth";
}

async function verifyAdminAuth(
  request: NextRequest,
  fallbackUser?: { username?: string; role?: string }
): Promise<{ authorized: boolean; role?: string; username?: string }> {
  const authHeader = request.headers.get("authorization");
  const secretKey = request.headers.get("x-admin-key");

  // Allow server secret key if provided
  const expectedSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secretKey && expectedSecret && secretKey === expectedSecret) {
    return { authorized: true, role: "super_admin", username: "super_admin" };
  }

  const token =
    authHeader?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("x-supabase-token") ||
    undefined;

  const adminClient = getAdminClient();

  if (token) {
    try {
      const { data: { user: authUser }, error } = await adminClient.auth.getUser(token);
      if (!error && authUser) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        const username = profile?.username || authUser.user_metadata?.username || "";
        const cleanName = username.trim().toLowerCase();
        if (cleanName === "jayanthadmin" || cleanName === "jayanth" || isMainAdmin(cleanName)) {
          return { authorized: true, role: "super_admin", username: username || "jayanthadmin" };
        }

        const email = (authUser.email || "").toLowerCase();
        if (email.startsWith("jayanthadmin") || email.startsWith("jayanth")) {
          return { authorized: true, role: "super_admin", username: username || "jayanthadmin" };
        }

        const dbRole = profile?.role || profile?.social_links?.role;
        if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
          return { authorized: true, role: dbRole, username };
        }
      }
    } catch (e) {
      console.error("verifyAdminAuth error in admin/rooms:", e);
    }
  }

  // Fallback via x-requester headers or query params
  const reqUsername =
    request.headers.get("x-requester-username") ||
    fallbackUser?.username ||
    request.nextUrl.searchParams.get("requesterUsername") ||
    undefined;

  const reqRole =
    request.headers.get("x-requester-role") ||
    fallbackUser?.role ||
    request.nextUrl.searchParams.get("requesterRole") ||
    undefined;

  if (reqUsername) {
    const cleanUser = reqUsername.trim().toLowerCase();
    if (isMainAdmin(cleanUser)) {
      return { authorized: true, role: "super_admin", username: reqUsername };
    }

    if (reqRole === "admin" || reqRole === "manager" || reqRole === "super_admin") {
      try {
        const { data: prof } = await adminClient
          .from("profiles")
          .select("*")
          .ilike("username", reqUsername)
          .maybeSingle();
        if (prof) {
          const isMain = isMainAdmin(prof.username);
          if (isMain) {
            return { authorized: true, role: "super_admin", username: prof.username };
          }
          const dbRole = prof.role || prof.social_links?.role;
          if (dbRole === "super_admin" || dbRole === "admin" || dbRole === "manager") {
            return { authorized: true, role: dbRole, username: prof.username };
          }
        }
      } catch (dbErr) {
        console.error("verifyAdminAuth rooms fallback DB error:", dbErr);
      }
    }
  }

  return { authorized: false };
}

// GET: Fetch all rooms including private / password-locked rooms (Staff only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requesterUsername = searchParams.get("requesterUsername");
    const requesterRole = searchParams.get("requesterRole");

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername || undefined,
      role: requesterRole || undefined,
    });
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
    const { searchParams } = new URL(request.url);
    const requesterUsername = searchParams.get("requesterUsername");
    const requesterRole = searchParams.get("requesterRole");

    const auth = await verifyAdminAuth(request, {
      username: requesterUsername || undefined,
      role: requesterRole || undefined,
    });
    if (!auth.authorized || (auth.role !== "super_admin" && auth.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required to force delete rooms" }, { status: 403 });
    }

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
