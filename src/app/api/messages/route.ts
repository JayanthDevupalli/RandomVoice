import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 50_000;

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  return !error && Boolean(data);
}

// Edit message (PATCH) - Only allowed by authenticated sender within 5 minutes of sending
export async function PATCH(request: NextRequest) {
  try {
    const authedUserId = await getAuthenticatedUserId(request);
    if (!authedUserId) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid auth token" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(`msg_edit:${authedUserId}:${getClientIp(request)}`, 30, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many edit requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { id, content, userId } = await request.json();

    if (!id || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "Message payload exceeds allowed size" }, { status: 413 });
    }

    if (userId && userId !== authedUserId) {
      return NextResponse.json({ error: "Forbidden: Cannot edit another user's message" }, { status: 403 });
    }

    // Verify message ownership & age: must be within 5 minutes (300,000 ms)
    const { data: existingMsg, error: fetchErr } = await supabaseAdmin
      .from("messages")
      .select("id, sender_id, created_at")
      .eq("id", id)
      .single();

    if (fetchErr || !existingMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (existingMsg.sender_id !== authedUserId) {
      return NextResponse.json({ error: "Forbidden: Cannot edit another user's message" }, { status: 403 });
    }

    const ageMs = Date.now() - new Date(existingMsg.created_at).getTime();
    if (ageMs > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: "Messages can only be edited within 5 minutes of being sent" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .update({ content })
      .eq("id", id)
      .eq("sender_id", authedUserId)
      .select()
      .single();

    if (error) {
      console.error("Error updating message via admin:", error);
      return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: data });
  } catch (error: any) {
    console.error("Message update exception:", error);
    return NextResponse.json({ error: "Failed to process message edit" }, { status: 500 });
  }
}

// Delete message or clear conversation messages (DELETE)
export async function DELETE(request: NextRequest) {
  try {
    const authedUserId = await getAuthenticatedUserId(request);
    if (!authedUserId) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid auth token" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(`msg_delete:${authedUserId}:${getClientIp(request)}`, 30, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many delete requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    const conversationId = searchParams.get("conversationId");

    if (!id && !conversationId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (userId && userId !== authedUserId) {
      return NextResponse.json({ error: "Forbidden: Unauthorized" }, { status: 403 });
    }

    if (conversationId) {
      const isMember = await isConversationMember(conversationId, authedUserId);
      if (!isMember) {
        return NextResponse.json(
          { error: "Forbidden: You are not a member of this conversation" },
          { status: 403 }
        );
      }

      const { error } = await supabaseAdmin
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);

      if (error) {
        console.error("Error clearing conversation messages via admin:", error);
        return NextResponse.json({ error: "Failed to clear conversation" }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Chat cleared successfully" });
    }

    const { error } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("id", id)
      .eq("sender_id", authedUserId);

    if (error) {
      console.error("Error deleting message via admin:", error);
      return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Message delete exception:", error);
    return NextResponse.json({ error: "Failed to process delete request" }, { status: 500 });
  }
}
