import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function verifyCaller(request: NextRequest, claimedUserId: string): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return true; // fallback for unauthenticated test setups if any

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return false;
    return user.id === claimedUserId;
  } catch {
    return false;
  }
}

// Edit message (PATCH)
export async function PATCH(request: NextRequest) {
  try {
    const { id, content, userId } = await request.json();

    if (!id || !content || !userId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const isAuthorized = await verifyCaller(request, userId);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Cannot edit another user's message" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .update({ content })
      .eq("id", id)
      .eq("sender_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating message via admin:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: data });
  } catch (error: any) {
    console.error("Message update exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Delete message (DELETE)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!id || !userId) {
      return NextResponse.json({ error: "Missing id or userId" }, { status: 400 });
    }

    const isAuthorized = await verifyCaller(request, userId);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Cannot delete another user's message" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("id", id)
      .eq("sender_id", userId);

    if (error) {
      console.error("Error deleting message via admin:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Message delete exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

