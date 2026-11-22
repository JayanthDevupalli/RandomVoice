import { NextRequest, NextResponse } from "next/server";
import { MusicTrack } from "@/lib/music-types";

export const dynamic = "force-dynamic";

// In-memory cache for popular/recent search queries (5 minute TTL)
const searchCache = new Map<string, { timestamp: number; data: MusicTrack[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseDurationSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const cleanQuery = query.slice(0, 100);
    const cacheKey = cleanQuery.toLowerCase();

    // Check in-memory cache
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ results: cached.data });
    }

    let results: MusicTrack[] = [];

    // Optional: If YOUTUBE_API_KEY is configured in env
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(
          cleanQuery
        )}&key=${process.env.YOUTUBE_API_KEY}`;
        const res = await fetch(apiUrl, { cache: "no-store" });
        if (res.ok) {
          const apiData = await res.json();
          results = (apiData.items || [])
            .map((item: any) => ({
              id: item.id?.videoId,
              source: "youtube" as const,
              url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
              title: item.snippet?.title || "Unknown Title",
              artist: item.snippet?.channelTitle || "YouTube Creator",
              thumbnail:
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                `https://img.youtube.com/vi/${item.id?.videoId}/hqdefault.jpg`,
              isLive: item.snippet?.liveBroadcastContent === "live",
            }))
            .filter((item: MusicTrack) => Boolean(item.id));
        }
      } catch (apiErr) {
        console.warn("YouTube Data API fetch failed, falling back to innerTube search:", apiErr);
      }
    }

    // Method 1: YouTube InnerTube Web Client Search API (zero quota, fast JSON)
    if (results.length === 0) {
      try {
        const innertubeRes = await fetch("https://www.youtube.com/youtubei/v1/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "WEB",
                clientVersion: "2.20240228.01.00",
                hl: "en",
                gl: "US",
              },
            },
            query: cleanQuery,
          }),
          cache: "no-store",
        });

        if (innertubeRes.ok) {
          const data = await innertubeRes.json();
          const sections =
            data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

          for (const section of sections) {
            const items = section?.itemSectionRenderer?.contents || [];
            for (const item of items) {
              const vr = item?.videoRenderer;
              if (vr && vr.videoId) {
                const title =
                  vr.title?.runs?.map((r: any) => r.text).join("") ||
                  vr.title?.simpleText ||
                  "Untitled Video";
                const artist =
                  vr.ownerText?.runs?.[0]?.text ||
                  vr.shortBylineText?.runs?.[0]?.text ||
                  "YouTube Artist";
                const durationFormatted = vr.lengthText?.simpleText || "";
                const isLive = Boolean(
                  vr.badges?.some(
                    (b: any) =>
                      b.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW"
                  ) || vr.style === "UPCOMING"
                );
                const thumbnail =
                  vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                  `https://img.youtube.com/vi/${vr.videoId}/hqdefault.jpg`;

                results.push({
                  id: vr.videoId,
                  source: "youtube",
                  url: `https://www.youtube.com/watch?v=${vr.videoId}`,
                  title,
                  artist,
                  thumbnail,
                  duration: parseDurationSeconds(durationFormatted),
                  durationFormatted: durationFormatted || (isLive ? "LIVE" : undefined),
                  isLive,
                });

                if (results.length >= 8) break;
              }
            }
            if (results.length >= 8) break;
          }
        }
      } catch (innerErr) {
        console.warn("YouTube innerTube search failed, attempting HTML scraping fallback:", innerErr);
      }
    }

    // Method 2: YouTube Search HTML scraping fallback
    if (results.length === 0) {
      try {
        const htmlRes = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}&sp=EgIQAQ%253D%253D`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            },
            cache: "no-store",
          }
        );

        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const match =
            html.match(/var ytInitialData = ({.*?});<\/script>/) ||
            html.match(/window\["ytInitialData"\] = ({.*?});<\/script>/);

          if (match && match[1]) {
            const data = JSON.parse(match[1]);
            const sections =
              data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

            for (const section of sections) {
              const items = section?.itemSectionRenderer?.contents || [];
              for (const item of items) {
                const vr = item?.videoRenderer;
                if (vr && vr.videoId) {
                  const title =
                    vr.title?.runs?.map((r: any) => r.text).join("") ||
                    vr.title?.simpleText ||
                    "Untitled Video";
                  const artist =
                    vr.ownerText?.runs?.[0]?.text ||
                    vr.shortBylineText?.runs?.[0]?.text ||
                    "YouTube Artist";
                  const durationFormatted = vr.lengthText?.simpleText || "";
                  const isLive = Boolean(
                    vr.badges?.some(
                      (b: any) =>
                        b.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW"
                    )
                  );
                  const thumbnail =
                    vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                    `https://img.youtube.com/vi/${vr.videoId}/hqdefault.jpg`;

                  results.push({
                    id: vr.videoId,
                    source: "youtube",
                    url: `https://www.youtube.com/watch?v=${vr.videoId}`,
                    title,
                    artist,
                    thumbnail,
                    duration: parseDurationSeconds(durationFormatted),
                    durationFormatted: durationFormatted || (isLive ? "LIVE" : undefined),
                    isLive,
                  });

                  if (results.length >= 8) break;
                }
              }
              if (results.length >= 8) break;
            }
          }
        }
      } catch (scrapeErr) {
        console.error("YouTube search scrape fallback failed:", scrapeErr);
      }
    }

    // Cache the results if any found
    if (results.length > 0) {
      searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
      // Keep cache bounded to at most 100 queries
      if (searchCache.size > 100) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) searchCache.delete(oldestKey);
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error in /api/music/search:", error);
    return NextResponse.json({ error: "Failed to search for music tracks", results: [] }, { status: 500 });
  }
}
