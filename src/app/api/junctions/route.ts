import { NextRequest, NextResponse } from "next/server";
import { getAllJunctions, createJunction, purgeUserFromAllJunctions } from "@/lib/junctions-store";
import { createClient } from "@supabase/supabase-js";

const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

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

    const { name, description, category, tags, creator, maxParticipants, isLocked, durationType } = body;

    if (!name || !category || !creator) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const { data: { user: authUser } } = await sbAdmin.auth.getUser(token);
        if (authUser) {
          const { data: prof } = await sbAdmin
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();
          if (prof) {
            creator.name = prof.username || creator.name;
            if (prof.avatar) creator.avatar = prof.avatar;
          }
        }
      } catch (e) {
        console.warn("Auth check error in POST /api/junctions:", e);
      }
    }

    const newJunction = await createJunction({
      name,
      description,
      category,
      tags: Array.isArray(tags) ? tags : [],
      maxParticipants,
      creator,
      isLocked: !!isLocked,
      durationType,
    });

    return NextResponse.json({ junction: newJunction }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
