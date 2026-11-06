import { NextRequest, NextResponse } from "next/server";
import { getAllJunctions, createJunction, purgeUserFromAllJunctions } from "@/lib/junctions-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const list = await getAllJunctions();
    const totalOnline = list.reduce((acc, j) => acc + j.currentCount, 0);

    return NextResponse.json(
      {
        junctions: list,
        totalOnline,
        totalJunctions: list.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/junctions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch junctions", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "purge_user_ghosts") {
      const { identities } = body;
      let purgedCount = 0;
      if (Array.isArray(identities) && identities.length > 0) {
        const result = await purgeUserFromAllJunctions(identities);
        purgedCount = result.purged;
      }
      return NextResponse.json({ success: true, purged: purgedCount > 0, count: purgedCount });
    }

    const { name, description, category, tags, creator, maxParticipants, isLocked } = body;

    if (!name || !category || !creator) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newJunction = await createJunction({
      name,
      description,
      category,
      tags: Array.isArray(tags) ? tags : [],
      maxParticipants,
      creator,
      isLocked: !!isLocked,
    });

    return NextResponse.json({ junction: newJunction }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
