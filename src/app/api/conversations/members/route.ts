import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getCallerId(request: NextRequest, fallbackUserId?: string): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user?.id) {
        return user.id;
      }
    } catch {
      // Fallback below
    }
  }
  return fallbackUserId || null;
}

// DELETE: Leave group or remove member from group
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let conversationId = searchParams.get("conversationId");
    let targetUserId = searchParams.get("targetUserId");
    let callerUserId = searchParams.get("callerUserId");

    // Also support JSON body if query params are not provided
    if (!conversationId || !targetUserId) {
      try {
        const body = await request.json();
        conversationId = body.conversationId || conversationId;
        targetUserId = body.targetUserId || targetUserId;
        callerUserId = body.callerUserId || callerUserId;
      } catch {
        // no body
      }
    }

    if (!conversationId || !targetUserId) {
      return NextResponse.json(
        { error: "Missing required parameters: conversationId and targetUserId" },
        { status: 400 }
      );
    }

    const effectiveCallerId = await getCallerId(request, callerUserId || undefined);

    // If removing someone else, verify caller is an admin in this conversation
    if (effectiveCallerId && effectiveCallerId !== targetUserId) {
      const { data: callerMember } = await supabaseAdmin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", conversationId)
        .eq("user_id", effectiveCallerId)
        .maybeSingle();

      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("username, role")
        .eq("id", effectiveCallerId)
        .maybeSingle();

      const isCallerStaff =
        callerProfile?.username?.toLowerCase() === "jayanthadmin" ||
        callerProfile?.username?.toLowerCase() === "jayanth" ||
        callerProfile?.role === "super_admin" ||
        callerProfile?.role === "admin";

      if (callerMember?.role !== "admin" && !isCallerStaff) {
        return NextResponse.json(
          { error: "Forbidden: Only group admins can remove other members" },
          { status: 403 }
        );
      }
    }

    // Check if target was admin before deleting
    const { data: targetMember } = await supabaseAdmin
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    const wasAdmin = targetMember?.role === "admin";

    // Delete the member row
    const { error: deleteError } = await supabaseAdmin
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("Error deleting conversation member:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Check remaining members
    const { data: remainingMembers, error: fetchErr } = await supabaseAdmin
      .from("conversation_members")
      .select("user_id, role, joined_at")
      .eq("conversation_id", conversationId)
      .order("joined_at", { ascending: true });

    if (!fetchErr && remainingMembers) {
      if (remainingMembers.length === 0) {
        // Group is now completely empty, clean up conversation
        await supabaseAdmin.from("conversations").delete().eq("id", conversationId);
        return NextResponse.json({ success: true, remainingCount: 0, groupDeleted: true });
      }

      // If the leaving user was an admin, make sure there is at least one admin remaining
      if (wasAdmin) {
        const hasAdmin = remainingMembers.some((m) => m.role === "admin");
        if (!hasAdmin && remainingMembers.length > 0) {
          const newAdminId = remainingMembers[0].user_id;
          await supabaseAdmin
            .from("conversation_members")
            .update({ role: "admin" })
            .eq("conversation_id", conversationId)
            .eq("user_id", newAdminId);
        }
      }
    }

    return NextResponse.json({
      success: true,
      remainingCount: remainingMembers?.length ?? 0,
    });
  } catch (error: any) {
    console.error("Exception in DELETE conversation member:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH: Update member role (e.g. promote/demote admin)
export async function PATCH(request: NextRequest) {
  try {
    const { conversationId, targetUserId, newRole, callerUserId } = await request.json();

    if (!conversationId || !targetUserId || !newRole) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const effectiveCallerId = await getCallerId(request, callerUserId);

    if (effectiveCallerId) {
      const { data: callerMember } = await supabaseAdmin
        .from("conversation_members")
        .select("role")
        .eq("conversation_id", conversationId)
        .eq("user_id", effectiveCallerId)
        .maybeSingle();

      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("username, role")
        .eq("id", effectiveCallerId)
        .maybeSingle();

      const isCallerStaff =
        callerProfile?.username?.toLowerCase() === "jayanthadmin" ||
        callerProfile?.username?.toLowerCase() === "jayanth" ||
        callerProfile?.role === "super_admin" ||
        callerProfile?.role === "admin";

      if (callerMember?.role !== "admin" && !isCallerStaff) {
        return NextResponse.json(
          { error: "Forbidden: Only admins can change member roles" },
          { status: 403 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("conversation_members")
      .update({ role: newRole })
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId);

    if (error) {
      console.error("Error updating member role:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, role: newRole });
  } catch (error: any) {
    console.error("Exception in PATCH conversation member:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
