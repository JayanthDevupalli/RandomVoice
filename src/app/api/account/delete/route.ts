import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId, username } = await request.json();

    if (!userId || !username) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // 1. Delete user from any active voice rooms
    await supabase
      .from("junction_participants")
      .delete()
      .or(`identity.eq.${username},id.eq.${userId}`);

    // 2. Delete any custom rooms created by this user (check both username and userId)
    await supabase
      .from("junctions")
      .delete()
      .or(`creator_id.eq.${username},creator_id.eq.${userId}`);

    // 3. Delete user's profile (cascades to connections, conversation_members, messages)
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.warn("Server profile delete warning:", profileError);
    }

    // 4. If Supabase service role key is available, permanently delete auth user
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (serviceRoleKey && supabaseUrl) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await adminClient.auth.admin.deleteUser(userId);
      } catch (adminErr) {
        console.warn("Admin delete user warning:", adminErr);
      }
    }

    return NextResponse.json({ success: true, message: "Account deleted permanently" });
  } catch (error: any) {
    console.error("Account delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
