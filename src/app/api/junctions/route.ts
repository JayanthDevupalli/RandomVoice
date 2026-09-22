import { NextRequest, NextResponse } from "next/server";
import { getAllJunctions, createJunction } from "@/lib/junctions-store";

export async function GET(request: NextRequest) {
  try {

    const list = await getAllJunctions();
    const totalOnline = list.reduce((acc, j) => acc + j.currentCount, 0);

    return NextResponse.json({
      junctions: list,
      totalOnline,
      totalJunctions: list.length,
    });
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
    const { name, description, category, tags, creator, maxParticipants } = body;

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
    });

    return NextResponse.json({ junction: newJunction }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
