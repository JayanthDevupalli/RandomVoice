import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { toggleReactionInContent } from "@/lib/chat-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  try {
    const authedUserId = await getAuthenticatedUserId(request);
    if (!authedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(`msg_react:${authedUserId}:${getClientIp(request)}`, 60, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many reactions. Take a breath!" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { messageId, emoji, userId, username, displayName } = body;

    if (!messageId || typeof emoji !== "string" || !emoji.trim() || emoji.length > 16) {
      return NextResponse.json(
        { error: "Invalid or missing parameters: messageId, emoji" },
        { status: 400 }
      );
    }

    if (userId && userId !== authedUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Fetch current message content
    const { data: message, error: fetchErr } = await supabaseAdmin
      .from("messages")
      .select("id, content, conversation_id")
      .eq("id", messageId)
      .single();

    if (fetchErr || !message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // 2. Verify caller is an actual member of the conversation
    const { data: membership, error: memberErr } = await supabaseAdmin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", message.conversation_id)
      .eq("user_id", authedUserId)
      .maybeSingle();

    if (memberErr || !membership) {
      return NextResponse.json(
        { error: "Forbidden: Not a member of this conversation" },
        { status: 403 }
      );
    }

    // 3. Toggle reaction inside message content
    const { newContent, reactions } = toggleReactionInContent(message.content, {
      emoji,
      userId: authedUserId,
      username,
      displayName,
    });

    // 4. Update message content in database
    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({ content: newContent })
      .eq("id", messageId);

    if (updateErr) {
      console.error("Failed to update message reactions:", updateErr);
      return NextResponse.json({ error: "Failed to save reaction" }, { status: 500 });
    }

    // 5. Optionally sync with message_reactions table if present
    try {
      const { data: existing } = await supabaseAdmin
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", authedUserId)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin.from("message_reactions").delete().eq("id", existing.id);
      } else {
        await supabaseAdmin.from("message_reactions").insert({
          message_id: messageId,
          user_id: authedUserId,
          emoji,
        });
      }
    } catch {
      // Ignored if table doesn't exist
    }

    return NextResponse.json({
      success: true,
      messageId,
      reactions,
      content: newContent,
    });
  } catch (error: any) {
    console.error("Message reaction exception:", error);
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }
}
