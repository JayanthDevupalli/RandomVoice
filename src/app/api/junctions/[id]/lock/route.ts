import { NextRequest, NextResponse } from "next/server";
import { toggleRoomLock } from "@/lib/junctions-store";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { moderatorIdentity, isLocked } = await request.json();

    if (!moderatorIdentity || typeof isLocked !== "boolean") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await toggleRoomLock(params.id, moderatorIdentity, isLocked);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ success: true, junction: result.junction });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
