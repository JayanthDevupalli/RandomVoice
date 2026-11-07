import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { toggleReactionInContent } from "@/lib/chat-utils";

export const dynamic = "force-dynamic";

async function verifyCaller(request: NextRequest, claimedUserId: string): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return true;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return false;
    return user.id === claimedUserId;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId, emoji, userId, username, displayName } = body;

    if (!messageId || !emoji || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters: messageId, emoji, userId" },
        { status: 400 }
      );
    }

    const isAuthorized = await verifyCaller(request, userId);
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

    // 2. Toggle reaction inside message content
    const { newContent, reactions } = toggleReactionInContent(message.content, {
      emoji,
      userId,
      username,
      displayName,
    });

    // 3. Update message content in database
    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({ content: newContent })
      .eq("id", messageId);

    if (updateErr) {
      console.error("Failed to update message reactions:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. Optionally sync with message_reactions table if present
    try {
      const { data: existing } = await supabaseAdmin
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin.from("message_reactions").delete().eq("id", existing.id);
      } else {
        await supabaseAdmin.from("message_reactions").insert({
          message_id: messageId,
          user_id: userId,
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

