import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const STATIONS = [
  { state: "Telangana", region: "South", districts: ["Hyderabad", "Secunderabad"] },
  { state: "Andhra Pradesh", region: "South", districts: ["Visakhapatnam", "Vijayawada"] },
  { state: "Karnataka", region: "South", districts: ["Bengaluru", "Mysuru"] },
  { state: "Tamil Nadu", region: "South", districts: ["Chennai", "Coimbatore"] },
  { state: "Maharashtra", region: "West", districts: ["Mumbai", "Pune"] },
  { state: "Kerala", region: "South", districts: ["Kochi", "Thiruvananthapuram"] },
  { state: "Gujarat", region: "West", districts: ["Ahmedabad", "Surat"] },
  { state: "Rajasthan", region: "North", districts: ["Jaipur", "Udaipur"] },
  { state: "Uttar Pradesh", region: "North", districts: ["Lucknow", "Varanasi"] },
  { state: "West Bengal", region: "East", districts: ["Kolkata", "Darjeeling"] },
  { state: "Punjab", region: "North", districts: ["Amritsar", "Ludhiana"] },
  { state: "Madhya Pradesh", region: "Central", districts: ["Indore", "Bhopal"] },
  { state: "Delhi", region: "North", districts: ["New Delhi", "Old Delhi"] }
];

export async function GET() {
  try {
    // 1. Delete existing public stations
    await supabase.from("junctions").delete().eq("is_custom", false);

    // 2. Prepare new stations
    const now = Date.now();
    const records = [];

    for (const st of STATIONS) {
      for (const dist of st.districts) {
        records.push({
          id: `station_${dist.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          name: dist,
          description: `Public voice room for ${dist}, ${st.state}.`,
          category: "casual",
          icon: "Mic",
          tags: ["Public", st.region, st.state, dist],
          max_participants: 7,
          current_count: 0,
          created_at: now,
          is_custom: false,
          creator_id: null,
          moderator_identity: "",
          is_locked: false,
          banned_identities: [],
        });
      }
    }

    // 3. Insert them
    const { error } = await supabase.from("junctions").insert(records);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, count: records.length, message: "Public stations seeded!" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
