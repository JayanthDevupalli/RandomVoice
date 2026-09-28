import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CITY_FAMOUS_MAP: Record<string, string> = {
  "Hyderabad": "Famous for Biryani, Charminar & Global IT Tech Hub",
  "Secunderabad": "Famous for Twin City heritage, Railway Hub & Hussain Sagar Lake",
  "Visakhapatnam": "Famous for RK Beach, Eastern Naval Command & Araku Valley",
  "Vijayawada": "Famous for Kanaka Durga Temple, Prakasam Barrage & Commerce",
  "Bengaluru": "Famous for Silicon Valley of India, Garden City & Pub Capital",
  "Mysuru": "Famous for Mysuru Palace, Silk Sarees & Grand Dasara Festival",
  "Chennai": "Famous for Marina Beach, Kollywood Cinema & Classical Music",
  "Coimbatore": "Famous for Manchester of South India, Textiles & Marudhamalai",
  "Mumbai": "Famous for City of Dreams, Bollywood & Gateway of India",
  "Pune": "Famous for Cultural Capital of MH, Shaniwar Wada & IT Parks",
  "Kochi": "Famous for Queen of Arabian Sea, Chinese Nets & Backwaters",
  "Thiruvananthapuram": "Famous for Padmanabhaswamy Temple & Kovalam Beach",
  "Ahmedabad": "Famous for Sabarmati Ashram, Textiles & Gujarati Street Food",
  "Surat": "Famous for Diamond Cutting Capital, Silk Textiles & Ghari Sweets",
  "Jaipur": "Famous for The Pink City, Hawa Mahal & Royal Rajput Forts",
  "Udaipur": "Famous for City of Lakes, Lake Palace & Regal Heritage",
  "Lucknow": "Famous for City of Nawabs, Tunday Kababs & Chikankari Embroidery",
  "Varanasi": "Famous for Spiritual Capital of India, Kashi Vishwanath & Ganga Ghats",
  "Kolkata": "Famous for City of Joy, Howrah Bridge, Durga Puja & Rosogolla",
  "Darjeeling": "Famous for World-famous Tea Gardens, Toy Train & Kanchenjunga Views",
  "Amritsar": "Famous for Golden Temple, Wagah Border & Amritsari Kulchas",
  "Ludhiana": "Famous for Industrial Hub of Punjab & Authentic Punjabi Cuisine",
  "Indore": "Famous for Cleanest City in India, Sarafa Night Market & Poha",
  "Bhopal": "Famous for City of Lakes, Upper Lake & Royal Begum Heritage",
  "New Delhi": "Famous for Capital of India, India Gate, Red Fort & Power Hub",
  "Old Delhi": "Famous for Chandni Chowk, Jama Masjid & Paranthe Wali Gali"
};

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
        const famousTagline = CITY_FAMOUS_MAP[dist] || `Public voice room for ${dist}, ${st.state}.`;
        records.push({
          id: `station_${dist.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          name: dist,
          description: famousTagline,
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
