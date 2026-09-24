import { NextRequest, NextResponse } from "next/server";
import {
  getJunctionById,
  addParticipantToJunction,
  removeParticipantFromJunction,
  moderateParticipant,
  deleteJunction,
} from "@/lib/junctions-store";

export const revalidate = 5;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const junction = await getJunctionById(params.id);
    if (!junction) {
      return NextResponse.json({ error: "Junction not found" }, { status: 404 });
    }
    return NextResponse.json({ junction });
  } catch (error: any) {
    console.error(`GET /api/junctions/${params.id} error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch junction", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, participant, identity, moderatorIdentity, targetIdentity, modAction, isLocked } = body;

    if (action === "join") {
      if (!participant) {
        return NextResponse.json({ error: "Missing participant" }, { status: 400 });
      }
      const result = await addParticipantToJunction(params.id, participant);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ junction: result.junction });
    }

    if (action === "leave") {
      if (!identity) {
        return NextResponse.json({ error: "Missing identity" }, { status: 400 });
      }
      await removeParticipantFromJunction(params.id, identity);
      const junction = await getJunctionById(params.id);
      return NextResponse.json({ junction });
    }

    if (action === "moderate") {
      if (!moderatorIdentity || !targetIdentity || !modAction) {
        return NextResponse.json({ error: "Missing required moderation parameters" }, { status: 400 });
      }
      const result = await moderateParticipant(params.id, moderatorIdentity, targetIdentity, modAction);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 403 });
      }
      return NextResponse.json({ junction: result.junction, success: true });
    }


    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorId = searchParams.get("creatorId") || undefined;

    const success = await deleteJunction(params.id, creatorId);
    if (!success) {
      return NextResponse.json({ error: "Junction not found or unauthorized" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Junction deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
